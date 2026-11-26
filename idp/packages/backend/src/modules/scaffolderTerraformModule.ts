import { coreServices, createBackendModule } from '@backstage/backend-plugin-api';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createTemplateAction,
  scaffolderActionsExtensionPoint,
} from '@backstage/plugin-scaffolder-node';

type GitHubRepository = {
  owner: string;
  repo: string;
};

const terraformParentRepository = 'mohapma/infra-orchestrator';

const parseRepository = (repoUrl: string): GitHubRepository => {
  const [, query = ''] = repoUrl.split('?');
  const params = new URLSearchParams(query);
  const owner = params.get('owner');
  const repo = params.get('repo');

  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
  }

  return { owner, repo };
};

const getGitHubToken = (config: { getConfigArray(path: string): Array<{ getOptionalString(path: string): string | undefined }> }) => {
  const token = config
    .getConfigArray('integrations.github')
    .find(entry => entry.getOptionalString('host') === 'github.com')
    ?.getOptionalString('token');

  if (!token) {
    throw new Error('GitHub integration token for github.com is not configured');
  }

  return token;
};

const createModuleDeclaration = ({
  serviceName,
  cloudProvider,
  iacRepository,
  useModuleProjectId = false,
}: {
  serviceName: string;
  cloudProvider: string;
  iacRepository: GitHubRepository;
  useModuleProjectId?: boolean;
}) => {
  const moduleName = `${serviceName.replaceAll('-', '_')}_${cloudProvider}`;
  const source = `git::https://github.com/${iacRepository.owner}/${iacRepository.repo}.git//${serviceName}-${cloudProvider}?ref=main`;

  if (cloudProvider === 'aws') {
    return `module "${moduleName}" {\n  source = "${source}"\n\n  region       = var.aws_region\n  environment  = "dev"\n  billing_code = "448325"\n}\n`;
  }

  if (cloudProvider === 'gcp') {
    const projectId = useModuleProjectId ? '' : '  project_id   = var.gcp_project_id\n';
    return `module "${moduleName}" {\n  source = "${source}"\n\n  region       = var.gcp_region\n${projectId}  environment  = "dev"\n  billing_code = "448325"\n}\n`;
  }

  if (cloudProvider === 'azure') {
    return `module "${moduleName}" {\n  source = "${source}"\n\n  region          = var.azure_region\n  subscription_id = var.azure_subscription_id\n  environment     = "dev"\n  billing_code    = "448325"\n}\n`;
  }

  throw new Error(`Unsupported cloud provider: ${cloudProvider}`);
};

const scaffolderTerraformModule = createBackendModule({
  moduleId: 'terraform-module-action',
  pluginId: 'scaffolder',
  register({ registerInit }) {
    registerInit({
      deps: {
        config: coreServices.rootConfig,
        scaffolderActions: scaffolderActionsExtensionPoint,
      },
      async init({ config, scaffolderActions }) {
        scaffolderActions.addActions(
          createTemplateAction({
            id: 'github:prepareTerraformRemoval',
            description: 'Prepares pull requests to remove a generated Terraform module and its folder.',
            schema: {
              input: {
                serviceName: z => z.string().min(1).max(63).regex(/^[a-z0-9-]+$/),
                cloudProvider: z => z.enum(['aws', 'gcp', 'azure']),
                confirmRemoval: z => z.literal(true),
              },
              output: {
                iacRepoUrl: z => z.string(),
                filesToDelete: z => z.array(z.string()),
              },
            },
            async handler(ctx) {
              const token = getGitHubToken(config);
              async function readGitHub<T>(repository: string, endpoint: string): Promise<T> {
                const response = await fetch(
                  `https://api.github.com/repos/${repository}/${endpoint}`,
                  {
                    headers: {
                      Accept: 'application/vnd.github+json',
                      Authorization: `Bearer ${token}`,
                    },
                  },
                );
                if (!response.ok) {
                  throw new Error(`GitHub returned ${response.status} while reading ${repository}/${endpoint}`);
                }
                return response.json() as Promise<T>;
              }

              const { serviceName, cloudProvider } = ctx.input;
              const folder = `${serviceName}-${cloudProvider}`;
              const moduleName = `${serviceName.replaceAll('-', '_')}_${cloudProvider}`;
              const modules = await readGitHub<{ content: string; encoding: string }>(
                terraformParentRepository,
                'contents/modules.tf?ref=main',
              );
              if (modules.encoding !== 'base64') {
                throw new Error('Expected GitHub to return modules.tf as base64.');
              }
              const original = Buffer.from(modules.content, 'base64').toString('utf8');
              const declaration = new RegExp(
                `^module "${moduleName}" \\{\\r?\\n[\\s\\S]*?^\\}[^\\S\\r\\n]*`,
                'gm',
              );
              const matches = [...original.matchAll(declaration)];
              if (matches.length !== 1) {
                throw new Error(`Expected one generated ${moduleName} module in modules.tf on main.`);
              }
              const match = matches[0];
              const [block] = match;
              const source = block.match(
                /^\s*source\s*=\s*"git::https:\/\/github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)\.git\/\/([a-z0-9-]+)\?ref=main"\s*$/m,
              );
              if (!source || source[3] !== folder) {
                throw new Error(`Module ${moduleName} does not reference the expected ${folder} folder on main.`);
              }
              const [, owner, repo] = source;
              const expected = createModuleDeclaration({
                serviceName,
                cloudProvider,
                iacRepository: { owner, repo },
              });
              const normalize = (text: string) =>
                text
                  .split(/\r?\n/)
                  .map(line => line.trim().replace(/^([a-z_]+)\s*=\s*/, '$1 = '))
                  .filter(Boolean)
                  .join('\n');
              const expectedWithModuleProjectId = expected.replace('  project_id   = var.gcp_project_id\n', '');
              if (![expected, expectedWithModuleProjectId].some(candidate => normalize(block) === normalize(candidate))) {
                throw new Error(`Module ${moduleName} has been customized. Review and remove it in GitHub.`);
              }

              type GitTree = {
                truncated: boolean;
                tree: { path: string; type: string; sha: string }[];
              };
              const repository = `${owner}/${repo}`;
              const root = await readGitHub<GitTree>(repository, 'git/trees/main');
              const directory = root.tree.find(entry => entry.path === folder && entry.type === 'tree');
              if (!directory || root.truncated) {
                throw new Error(`Unable to locate ${folder} on main in ${repository}.`);
              }
              const contents = await readGitHub<GitTree>(repository, `git/trees/${directory.sha}?recursive=1`);
              const files = contents.tree.filter(entry => entry.type === 'blob');
              if (contents.truncated || contents.tree.some(entry => !['blob', 'tree'].includes(entry.type)) ||
                  !files.some(entry => entry.path === 'main.tf')) {
                throw new Error(`Unable to verify the complete Terraform folder ${folder}.`);
              }

              const parentPath = join(ctx.workspacePath, 'parent');
              await mkdir(parentPath, { recursive: true });
              await mkdir(join(ctx.workspacePath, 'folder-removal'), { recursive: true });
              const newline = original.includes('\r\n') ? '\r\n' : '\n';
              const before = original.slice(0, match.index).trimEnd();
              const after = original.slice(match.index + block.length).replace(/^(?:\r?\n)+/, '');
              const updated = before && after ? `${before}${newline}${newline}${after}` : after || (before ? before + newline : '');
              await writeFile(join(parentPath, 'modules.tf'), updated, 'utf8');
              ctx.output('iacRepoUrl', `github.com?owner=${owner}&repo=${repo}`);
              ctx.output('filesToDelete', files.map(entry => `${folder}/${entry.path}`));
            },
          }),
          createTemplateAction({
            id: 'github:append-terraform-module',
            description:
              'Appends a cloud service child module to modules.tf and opens a GitHub pull request.',
            schema: {
              input: {
                repoUrl: z => z.string(),
                iacRepoUrl: z => z.string(),
                serviceName: z => z.string().regex(/^[a-z0-9-]+$/),
                cloudProvider: z => z.enum(['aws', 'gcp', 'azure']),
                gcpProjectId: z => z.union([
                  z.literal(''),
                  z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/),
                ]).optional(),
              },
              output: {
                remoteUrl: z => z.string(),
              },
            },
            async handler(ctx) {
              const parentRepository = parseRepository(ctx.input.repoUrl);
              const iacRepository = parseRepository(ctx.input.iacRepoUrl);
              const token = getGitHubToken(config);
              const moduleDeclaration = createModuleDeclaration({
                serviceName: ctx.input.serviceName,
                cloudProvider: ctx.input.cloudProvider,
                iacRepository,
                useModuleProjectId: Boolean(ctx.input.gcpProjectId),
              });
              const branchName = `add-${ctx.input.serviceName}-${ctx.input.cloudProvider}-module`;
              const apiUrl = `https://api.github.com/repos/${parentRepository.owner}/${parentRepository.repo}`;
              const headers = {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28',
              };

              const request = async (url: string, init?: RequestInit) => {
                const response = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });
                if (!response.ok) {
                  throw new Error(`GitHub request failed (${response.status}): ${await response.text()}`);
                }
                return response.json();
              };

              const [mainRef, modulesFile] = await Promise.all([
                request(`${apiUrl}/git/ref/heads/main`),
                request(`${apiUrl}/contents/modules.tf?ref=main`),
              ]);
              const currentContent = Buffer.from(modulesFile.content, 'base64').toString('utf8');
              const moduleName = `${ctx.input.serviceName.replaceAll('-', '_')}_${ctx.input.cloudProvider}`;

              if (currentContent.includes(`module "${moduleName}"`)) {
                throw new Error(`Module ${moduleName} already exists in modules.tf`);
              }

              await request(`${apiUrl}/git/refs`, {
                method: 'POST',
                body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: mainRef.object.sha }),
              });

              const updatedContent = `${currentContent.trimEnd()}\n\n${moduleDeclaration}`;
              await request(`${apiUrl}/contents/modules.tf`, {
                method: 'PUT',
                body: JSON.stringify({
                  message: `feat(terraform): add ${ctx.input.serviceName} ${ctx.input.cloudProvider} module`,
                  content: Buffer.from(updatedContent).toString('base64'),
                  branch: branchName,
                  sha: modulesFile.sha,
                }),
              });

              const pullRequest = await request(`${apiUrl}/pulls`, {
                method: 'POST',
                body: JSON.stringify({
                  title: `feat(terraform): add ${ctx.input.serviceName} (${ctx.input.cloudProvider}) child module`,
                  head: branchName,
                  base: 'main',
                  body: `Declare the ${ctx.input.serviceName}-${ctx.input.cloudProvider} child module from ${iacRepository.owner}/${iacRepository.repo}.`,
                }),
              });

              ctx.output('remoteUrl', pullRequest.html_url);
            },
          }),
        );
      },
    });
  },
});

export default scaffolderTerraformModule;

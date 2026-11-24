import { coreServices, createBackendModule } from '@backstage/backend-plugin-api';
import {
  createTemplateAction,
  scaffolderActionsExtensionPoint,
} from '@backstage/plugin-scaffolder-node';

type GitHubRepository = {
  owner: string;
  repo: string;
};

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
}: {
  serviceName: string;
  cloudProvider: string;
  iacRepository: GitHubRepository;
}) => {
  const moduleName = `${serviceName.replaceAll('-', '_')}_${cloudProvider}`;
  const source = `git::https://github.com/${iacRepository.owner}/${iacRepository.repo}.git//${serviceName}-${cloudProvider}?ref=main`;

  if (cloudProvider === 'aws') {
    return `module "${moduleName}" {\n  source = "${source}"\n\n  region       = var.aws_region\n  environment  = "dev"\n  billing_code = "448325"\n}\n`;
  }

  if (cloudProvider === 'gcp') {
    return `module "${moduleName}" {\n  source = "${source}"\n\n  region       = var.gcp_region\n  project_id   = var.gcp_project_id\n  environment  = "dev"\n  billing_code = "448325"\n}\n`;
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
            id: 'github:append-terraform-module',
            description:
              'Appends a cloud service child module to modules.tf and opens a GitHub pull request.',
            schema: {
              input: {
                repoUrl: z => z.string(),
                iacRepoUrl: z => z.string(),
                serviceName: z => z.string().regex(/^[a-z0-9-]+$/),
                cloudProvider: z => z.enum(['aws', 'gcp', 'azure']),
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

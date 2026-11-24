import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
import { compatWrapper } from '@backstage/core-compat-api';
import {
  EntityGithubActionsContent,
  isGithubActionsAvailable,
} from '@backstage/plugin-github-actions';

const githubActionsEntityContent = EntityContentBlueprint.make({
  name: 'entity',
  params: {
    path: '/ci-cd',
    title: 'CI/CD',
    filter: isGithubActionsAvailable,
    loader: async () =>
      compatWrapper(<EntityGithubActionsContent />),
  },
});

export const githubActionsPlugin = createFrontendPlugin({
  pluginId: 'github-actions',
  extensions: [githubActionsEntityContent],
});
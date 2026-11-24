import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import { navModule } from './modules/nav';
import { homeModule } from './modules/home';
import { workspacePlugin } from './modules/workspace';
import { githubActionsPlugin } from './modules/githubActions';

export default createApp({
  features: [
    catalogPlugin,
    scaffolderPlugin,
    githubActionsPlugin,
    navModule,
    homeModule,
    workspacePlugin,
  ],
});
import { createApp } from '@backstage/frontend-defaults';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import { catalogPluginWithLinks } from './modules/catalog/catalogLinksModule';
import { navModule } from './modules/nav';
import { homeModule } from './modules/home';
import { workspacePlugin } from './modules/workspace';
import { githubActionsPlugin } from './modules/githubActions';

export default createApp({
  features: [
    catalogPluginWithLinks,
    scaffolderPlugin,
    githubActionsPlugin,
    navModule,
    homeModule,
    workspacePlugin,
  ],
});

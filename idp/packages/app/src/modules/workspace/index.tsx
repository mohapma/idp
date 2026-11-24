import {
  createFrontendPlugin,
  PageBlueprint,
  createRouteRef,
} from '@backstage/frontend-plugin-api';

const workspaceRouteRef = createRouteRef();

const workspacePage = PageBlueprint.make({
  params: {
    path: '/workspace',
    routeRef: workspaceRouteRef,
    loader: () =>
      import('../../components/workspace/WorkspacePage').then(m => (
        <m.WorkspacePage />
      )),
  },
});

export const workspacePlugin = createFrontendPlugin({
  pluginId: 'workspace',
  extensions: [workspacePage],
});

import { coreExtensionData } from '@backstage/frontend-plugin-api';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { catalogEntityDeletePermission } from '@backstage/plugin-catalog-common/alpha';
import { useEntity } from '@backstage/plugin-catalog-react';
import {
  EntityContextMenuItemBlueprint,
  useEntityPermission,
} from '@backstage/plugin-catalog-react/alpha';
import { Button, makeStyles } from '@material-ui/core';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import harnessLogo from './harness.svg';
import dockerLogo from './docker.svg';

const links = [
  {
    name: 'Harness',
    href: 'https://app.harness.io/ng/account/Qi1TU158ShqIhQ-7bnFTng/all/orgs/default/projects/infra_orchestrator',
    logo: harnessLogo,
  },
  {
    name: 'Docker Hub',
    href: 'https://hub.docker.com/repositories/manasranjan21',
    logo: dockerLogo,
  },
];

const useStyles = makeStyles(theme => ({
  page: {
    [theme.breakpoints.up('lg')]: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr)',
      // Share the catalog title row while keeping its title and actions intact.
      '& > [class*="bui-HeaderContent"]': {
        gridArea: '2 / 1',
      },
    },
  },
  links: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 2),
    [theme.breakpoints.up('lg')]: {
      gridArea: '2 / 1',
      alignSelf: 'center',
      justifySelf: 'center',
      zIndex: 1,
    },
  },
  button: {
    textTransform: 'none',
  },
}));

function CatalogWithLinks({ children }: { children: ReactNode }) {
  const classes = useStyles();

  return (
    <div className={classes.page}>
      <nav className={classes.links} aria-label="Catalog tools">
        {links.map(({ name, href, logo }) => (
          <Button
            key={name}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${name} (opens in a new tab)`}
            variant="outlined"
            startIcon={<img src={logo} alt="" width={24} height={24} />}
            className={classes.button}
          >
            {name}
          </Button>
        ))}
      </nav>
      {children}
    </div>
  );
}

const catalogPage = catalogPlugin.getExtension('page:catalog').override({
  factory(originalFactory) {
    const page = originalFactory();
    return Array.from(page, data =>
      data.id === coreExtensionData.reactElement.id
        ? coreExtensionData.reactElement(
            <CatalogWithLinks>{data.value}</CatalogWithLinks>,
          )
        : data,
    );
  },
});

const cloudProviders = ['aws', 'gcp', 'azure'];

const decommissionService = EntityContextMenuItemBlueprint.make({
  name: 'decommission-service',
  params: {
    icon: <DeleteOutlineIcon fontSize="small" />,
    filter: entity =>
      entity.kind === 'Component' &&
      (entity.metadata.tags ?? []).includes('golden-path'),
    useProps: () => {
      const { entity } = useEntity();
      const permission = useEntityPermission(catalogEntityDeletePermission);
      const navigate = useNavigate();
      const cloudProvider = entity.metadata.tags?.find(tag =>
        cloudProviders.includes(tag),
      );

      return {
        title: 'Decommission Terraform service',
        disabled: !permission.allowed,
        onClick: () => {
          const query = new URLSearchParams({
            formData: JSON.stringify({
              serviceName: entity.metadata.name,
              cloudProvider,
            }),
          });
          navigate(`/create/templates/default/decommission-service?${query}`);
        },
      };
    },
  },
});

export const catalogPluginWithLinks = catalogPlugin.withOverrides({
  extensions: [catalogPage, decommissionService],
});

import { useState } from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Entity, RELATION_DEPENDENCY_OF } from '@backstage/catalog-model';
import { Page, Header, Content, InfoCard, Progress, Link } from '@backstage/core-components';
import { Grid, List, ListItem, ListItemIcon, Chip, Typography, Box, TextField, Collapse, IconButton, Divider, Button } from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import GitHubIcon from '@material-ui/icons/GitHub';
import AppsIcon from '@material-ui/icons/Apps';

const ProviderLogo = ({ type }: { type: string }) => {
  switch (type) {
    case 'gcp':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="#EA4335" d="M12.2 6.8l2.6-2.6C13.2 2.8 11.1 2 8.8 2 4.7 2 1.3 4.9.5 8.8l3.5 1.1C4.6 7.5 6.5 5.8 8.8 5.8c1.3 0 2.5.4 3.4 1z" />
          <path fill="#4285F4" d="M23.2 11.2c-.4-2.1-1.6-3.9-3.3-5.1l-2.6 2.6c1 .8 1.7 2 1.9 3.4h.5c1.7 0 3 1.3 3 3s-1.3 3-3 3h-5v3.8h5c3.7 0 6.8-3 6.8-6.8 0-1.5-.5-2.8-1.3-3.9z" />
          <path fill="#34A853" d="M7.5 21.9h7.2v-3.8H7.5c-.6 0-1.1-.1-1.6-.4l-2.6 2.6c1.2 1 2.7 1.6 4.2 1.6z" />
          <path fill="#FBBC05" d="M7.5 8.2C3.8 8.2.8 11.2.8 15c0 2.2 1 4.1 2.6 5.4l2.7-2.7c-.9-.6-1.5-1.6-1.5-2.7 0-1.7 1.3-3 3-3 1.1 0 2.1.6 2.7 1.5l2.7-2.7C11.6 9.2 9.7 8.2 7.5 8.2z" />
        </svg>
      );
    case 'aws':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="#FF9900" d="M18.6 15.8c-2.2 1.6-5.4 2.5-8.1 2.5-3.8 0-7.3-1.4-9.9-3.8-.2-.2 0-.5.2-.3 2.8 1.6 6.3 2.6 9.9 2.6 2.4 0 5.1-.5 7.5-1.5.4-.2.7.2.4.5z" />
          <path fill="#FF9900" d="M19.5 14.8c-.3-.4-1.9-.2-2.6-.1-.2 0-.3-.2-.1-.3 1.3-.9 3.4-.6 3.6-.3.2.3-.1 2.4-1.3 3.4-.2.2-.4.1-.3-.1.3-.7.9-2.2.7-2.6z" />
          <text x="3" y="12" fill="#232F3E" fontSize="8" fontWeight="bold" fontFamily="sans-serif">AWS</text>
        </svg>
      );
    case 'azure':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="#0078D4" d="M13.5 3L6.2 19.5H2.5L9.8 3h3.7zm1.2 4.2l5.8 12.3H10l2.2-4.2h4.2l-1.7-8.1z" />
        </svg>
      );
    case 'git-repository':
      return <GitHubIcon style={{ color: '#24292e', width: 24, height: 24 }} />;
    default:
      return <AppsIcon style={{ color: '#555', width: 24, height: 24 }} />;
  }
};

const RESOURCE_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'gcp', label: 'GCP' },
  { key: 'aws', label: 'AWS' },
  { key: 'azure', label: 'Azure' },
  { key: 'git-repository', label: 'Git' },
];

const getEntityCatalogPath = (entity: Entity) => {
  const ns = entity.metadata.namespace || 'default';
  return `/catalog/${ns}/${entity.kind.toLowerCase()}/${entity.metadata.name}`;
};

export const WorkspacePage = () => {
  const catalogApi = useApi(catalogApiRef);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const { value: entities = [], loading } = useAsync(async () => {
    const response = await catalogApi.getEntities({ filter: { kind: ['Resource', 'Component'] } });
    return response.items;
  }, []);

  const toggleExpand = (name: string) => setExpandedCards(prev => ({ ...prev, [name]: !prev[name] }));
  const childEntities = entities.filter(e => e.relations?.some(r => r.type === RELATION_DEPENDENCY_OF));
  const childNames = new Set(childEntities.map(c => c.metadata.name));

  const topLevelEntities = entities.filter(e => {
    if (childNames.has(e.metadata.name)) return false;
    const matchesType = selectedType === 'all' || e.spec?.type === selectedType;
    const title = (e.metadata.title || e.metadata.name).toLowerCase();
    const desc = (e.metadata.description || '').toLowerCase();
    const matchesSearch = !searchQuery || title.includes(searchQuery.toLowerCase()) || desc.includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const getChildrenForParent = (parent: Entity) => {
    const ns = parent.metadata.namespace || 'default';
    const parentRef = `${parent.kind.toLowerCase()}:${ns}/${parent.metadata.name}`;
    return childEntities.filter(child => child.relations?.some(r => r.type === RELATION_DEPENDENCY_OF && r.targetRef === parentRef));
  };
  return (
    <Page themeId="tool">
      <Header title="Team Workspace" subtitle="Categorized Cloud and Platform Resources" />
      <Content>
        {loading ? <Progress /> : (
          <Grid container spacing={3}>
            <Grid item xs={12} md={3}>
              <InfoCard title="Resource Type">
                <Box mb={2}>
                  <TextField fullWidth size="small" variant="outlined" placeholder="Search resources..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </Box>
                <List component="nav" dense>
                  {RESOURCE_CATEGORIES.map(cat => {
                    const count = cat.key === 'all' ? entities.length : entities.filter(e => e.spec?.type === cat.key).length;
                    return (
                      <ListItem
                        button
                        key={cat.key}
                        selected={selectedType === cat.key}
                        onClick={() => setSelectedType(cat.key)}
                        title={cat.label}
                        style={{ justifyContent: 'space-between' }}
                      >
                        <ListItemIcon style={{ minWidth: 32 }}>
                        <ProviderLogo type={cat.key} />
                        </ListItemIcon>
                        <Chip label={count} size="small" />
                        </ListItem>
                      );
                 })}
                </List>
              </InfoCard>
            </Grid>
            <Grid item xs={12} md={9}>
              {topLevelEntities.length === 0 ? (
                <InfoCard><Typography>No resources match the selected filter.</Typography></InfoCard>
              ) : (
                topLevelEntities.map(entity => {
                  const children = getChildrenForParent(entity);
                  const isExpanded = expandedCards[entity.metadata.name] ?? true;
                  const repoLink = entity.metadata.links?.find(l => l.url)?.url;
                  const entityTitle = entity.metadata.title || entity.metadata.name;
                  const entityPath = getEntityCatalogPath(entity);
                  return (
                    <Box key={entity.metadata.name} mb={2}>
                      <InfoCard>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Box display="flex" alignItems="center" style={{ gap: 10 }}>
                            {children.length > 0 && (
                              <IconButton size="small" onClick={() => toggleExpand(entity.metadata.name)}>
                                {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                              </IconButton>
                            )}
                            
                            <Box>
                              <Typography variant="h6">
                                <Link to={entityPath}>{entityTitle}</Link>
                              </Typography>
                              <Typography variant="body2" color="textSecondary">{entity.metadata.description}</Typography>
                            </Box>
                          </Box>
                          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                            {entity.metadata.tags?.map(tag => <Chip key={tag} label={tag.toUpperCase()} size="small" />)}
                          </Box>
                        </Box>
                        {repoLink && (
                          <Box mt={1}>
                            <Button size="small" startIcon={<GitHubIcon />} href={repoLink} target="_blank">{repoLink}</Button>
                          </Box>
                        )}
                        {children.length > 0 && (
                          <Collapse in={isExpanded}>
                            <Box mt={2} pl={3} borderLeft="2px solid #4caf50">
                              {children.map(child => {
                                const childTitle = child.metadata.title || child.metadata.name;
                                const childPath = getEntityCatalogPath(child);
                                return (
                                  <Box key={child.metadata.name} py={1}>
                                    <Divider />
                                    <Box pt={1} display="flex" justifyContent="space-between" alignItems="center">
                                      <Box>
                                        <Typography variant="subtitle1"><Link to={childPath}>{childTitle}</Link></Typography>
                                        <Typography variant="body2" color="textSecondary">{child.metadata.description}</Typography>
                                      </Box>
                                      <Box display="flex" style={{ gap: 6 }}>
                                        {child.metadata.tags?.map(tag => <Chip key={tag} label={tag.toUpperCase()} size="small" variant="outlined" />)}
                                      </Box>
                                    </Box>
                                  </Box>
                                );
                              })}
                            </Box>
                          </Collapse>
                        )}
                      </InfoCard>
                    </Box>
                  );
                })
              )}
            </Grid>
          </Grid>
        )}
      </Content>
    </Page>
  );
};

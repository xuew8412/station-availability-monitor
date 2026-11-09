export default async function install(app) {
  const mount = app.getMount('station-filter-results');
  const layer = app.layers[app.config.layerId];
  await layer.load();
  const layerView = await app.view.whenLayerView(layer);
  const style = document.createElement('style');
  style.textContent = `#app-mount-station-filter-results .station-stack { display:grid; gap:var(--app-gap); } #app-mount-station-filter-results .station-summary { color:var(--app-text-muted); font-size:0.875rem; } #app-mount-station-filter-results .station-response { color:var(--app-text-muted); font-size:0.8rem; }`;
  const content = document.createElement('div');
  content.className = 'station-stack';
  const boroughSelect = document.createElement('calcite-select');
  boroughSelect.setAttribute('label', 'Borough');
  const availability = document.createElement('calcite-checkbox');
  availability.setAttribute('label', 'Available stations only');
  availability.checked = false;
  const availabilityLabel = document.createElement('calcite-label');
  availabilityLabel.textContent = 'Available stations only';
  availabilityLabel.append(availability);
  const summary = document.createElement('div');
  summary.className = 'station-summary';
  const list = document.createElement('calcite-list');
  list.setAttribute('label', 'Matching stations');
  list.setAttribute('selection-mode', 'single');
  content.append(boroughSelect, availabilityLabel, summary, list);
  mount.replaceChildren(style, content);

  const distinct = await layer.queryFeatures({ where: '1=1', outFields: ['borough'], returnGeometry: false, returnDistinctValues: true, orderByFields: ['borough ASC'] });
  const boroughs = [...new Set(distinct.features.map((f) => String(f.attributes.borough)))].sort();
  const allOption = document.createElement('calcite-option');
  allOption.value = 'all'; allOption.textContent = 'All boroughs'; boroughSelect.append(allOption);
  for (const borough of boroughs) { const option = document.createElement('calcite-option'); option.value = borough; option.textContent = borough; boroughSelect.append(option); }

  let selectedId = null;
  let highlight = null;
  const whereClause = () => {
    const clauses = [];
    if (boroughSelect.value && boroughSelect.value !== 'all') clauses.push("borough = '" + boroughSelect.value.replace(/'/g, "''") + "'");
    if (availability.checked) clauses.push("status = 'Available'");
    return clauses.length ? clauses.join(' AND ') : '1=1';
  };
  const render = async (focusId = selectedId) => {
    const where = whereClause();
    layerView.filter = { where };
    const result = await layer.queryFeatures({ where, outFields: ['OBJECTID', 'station', 'borough', 'status', 'response_min'], returnGeometry: true, orderByFields: ['response_min ASC'] });
    const features = result.features;
    const availableCount = features.filter((f) => f.attributes.status === 'Available').length;
    summary.textContent = `${features.length} station${features.length === 1 ? '' : 's'} shown · ${availableCount} available`;
    list.replaceChildren(...features.map((feature) => {
      const a = feature.attributes;
      const item = document.createElement('calcite-list-item');
      const id = String(feature.getObjectId());
      item.value = id;
      item.setAttribute('label', `${a.station} · ${a.status}`);
      item.setAttribute('description', `${a.borough} · ${a.response_min} min response`);
      item.setAttribute('icon-start', a.status === 'Available' ? 'check' : (a.status === 'Busy' ? 'exclamation-mark-triangle' : 'x'));
      if (id === String(focusId)) item.selected = true;
      return item;
    }));
    if (highlight) { highlight.remove(); highlight = null; }
    const focusFeature = features.find((f) => String(f.getObjectId()) === String(focusId));
    if (focusFeature) highlight = layerView.highlight(focusFeature);
  };
  const selectStation = async (id, goTo) => {
    selectedId = String(id);
    const result = await layer.queryFeatures({ objectIds: [Number(id)], outFields: ['OBJECTID', 'borough'], returnGeometry: true });
    const feature = result.features[0];
    if (!feature) return;
    const borough = String(feature.attributes.borough);
    if (boroughSelect.value !== borough) boroughSelect.value = borough;
    await render(selectedId);
    if (goTo) await app.view.goTo({ target: feature.geometry, scale: 12000 });
  };
  const onFilter = () => { selectedId = null; render(); };
  const onList = (event) => { const item = event.target.selectedItems && event.target.selectedItems[0]; if (item) selectStation(item.value, true); };
  boroughSelect.addEventListener('calciteSelectChange', onFilter);
  availability.addEventListener('calciteCheckboxChange', onFilter);
  list.addEventListener('calciteListChange', onList);
  const registration = app.actions.register('show-station-selection', ({ graphic }) => selectStation(graphic.getObjectId(), false));
  app.onCleanup(() => { boroughSelect.removeEventListener('calciteSelectChange', onFilter); availability.removeEventListener('calciteCheckboxChange', onFilter); list.removeEventListener('calciteListChange', onList); registration.remove(); if (highlight) highlight.remove(); layerView.filter = null; style.remove(); });
  await render();
}
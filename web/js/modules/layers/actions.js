import { findIndex as lodashFindIndex } from 'lodash';
import {
  addLayer as addLayerSelector,
  addOrbitTrack as addOrbitTrackSelector,
  resetLayers as resetLayersSelector,
  getLayers as getLayersSelector,
  activateLayersForEventCategory as activateLayersForEventCategorySelector
} from './selectors';

import {
  RESET_LAYERS,
  ADD_LAYER,
  INIT_SECOND_LAYER_GROUP,
  REORDER_LAYER_GROUP,
  ON_LAYER_HOVER,
  TOGGLE_LAYER_VISIBILITY,
  REMOVE_LAYER,
  UPDATE_OPACITY,
  ADD_LAYERS_FOR_EVENT,
  ADD_ORBIT_TRACK
} from './constants';
import { selectProduct } from '../data/actions';

export function resetLayers(activeString) {
  return (dispatch, getState) => {
    const { config } = getState();
    const newLayers = resetLayersSelector(
      config.defaults.startingLayers,
      config.layers
    );

    dispatch({
      type: RESET_LAYERS,
      activeString,
      layers: newLayers
    });
  };
}
export function activateLayersForEventCategory(activeLayers) {
  return (dispatch, getState) => {
    const state = getState();
    const newLayers = activateLayersForEventCategorySelector(
      activeLayers,
      state
    );

    dispatch({
      type: ADD_LAYERS_FOR_EVENT,
      activeString: state.compare.activeString,
      layers: newLayers
    });
  };
}
export function addOrbitTrack(trackId, layer) {
  return (dispatch, getState) => {
    const state = getState();
    const { layers, compare } = state;
    const { activeString } = compare;
    const newLayers = addOrbitTrackSelector(
      trackId,
      layer,
      {},
      layers[activeString],
      layers.layerConfig
    );

    dispatch({
      type: ADD_ORBIT_TRACK,
      trackId,
      activeString,
      layers: newLayers
    });
  };
}

export function addLayer(id, spec) {
  spec = spec || {};
  return (dispatch, getState) => {
    const state = getState();
    const { layers, compare } = state;

    const activeString = compare.activeString;
    const layerObj = getLayersSelector(
      layers[activeString],
      { group: 'all' },
      state
    );
    const newLayers = addLayerSelector(
      id,
      spec,
      layers[activeString],
      layers.layerConfig,
      layerObj.overlays.length || 0
    );

    dispatch({
      type: ADD_LAYER,
      id,
      activeString,
      layers: newLayers
    });
  };
}
export function clearGraticule() {
  return (dispatch, getState) => {
    dispatch(toggleVisibility('Graticule', false));
  };
}
export function initSecondLayerGroup() {
  return {
    type: INIT_SECOND_LAYER_GROUP
  };
};

export function reorderLayers(layerArray) {
  return (dispatch, getState) => {
    const { compare } = getState();
    const activeString = compare.isCompareA ? 'active' : 'activeB';
    dispatch({
      type: REORDER_LAYER_GROUP,
      layers: layerArray,
      activeString
    });
  };
};
export function layerHover(id, isMouseOver) {
  return {
    type: ON_LAYER_HOVER,
    id: id,
    active: isMouseOver
  };
}
export function toggleVisibility(id, visible) {
  return (dispatch, getState) => {
    const { layers, compare } = getState();
    const activeString = compare.isCompareA ? 'active' : 'activeB';
    const index = lodashFindIndex(layers[activeString], {
      id: id
    });

    dispatch({
      type: TOGGLE_LAYER_VISIBILITY,
      id,
      index,
      visible,
      activeString
    });
  };
}
export function removeLayer(id) {
  return (dispatch, getState) => {
    const { layers, compare, data } = getState();
    const activeString = compare.activeString;
    const index = lodashFindIndex(layers[activeString], {
      id: id
    });
    if (index === -1) {
      return console.warn('Invalid layer ID: ' + id);
    }

    const def = layers[activeString][index];
    if (def.product && def.product === data.selectedProduct) {
      dispatch(selectProduct('')); // Clear selected Data product
    }
    dispatch({
      type: REMOVE_LAYER,
      id,
      index,
      activeString,
      def
    });
  };
}
export function setOpacity(id, opacity) {
  return (dispatch, getState) => {
    const { layers, compare } = getState();
    const activeString = compare.isCompareA ? 'active' : 'activeB';
    const index = lodashFindIndex(layers[activeString], {
      id: id
    });
    if (index === -1) {
      return console.warn('Invalid layer ID: ' + id);
    }

    dispatch({
      type: UPDATE_OPACITY,
      id,
      index,
      opacity,
      activeString
    });
  };
}

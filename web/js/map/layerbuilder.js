import util from '../util/util';
import styles from '../styles/styles';
import OlTileGridWMTS from 'ol/tilegrid/WMTS';
import OlSourceWMTS from 'ol/source/WMTS';
import OlSourceTileWMS from 'ol/source/TileWMS';
import OlLayerGroup from 'ol/layer/Group';
import OlLayerTile from 'ol/layer/Tile';
import OlTileGridTileGrid from 'ol/tilegrid/TileGrid';
import MVT from 'ol/format/MVT';
import LayerVectorTile from 'ol/layer/VectorTile';
import SourceVectorTile from 'ol/source/VectorTile';
// import { applyStyle } from 'ol-mapbox-style';
import stylefunction from 'ol-mapbox-style/stylefunction';
import lodashCloneDeep from 'lodash/cloneDeep';
import lodashMerge from 'lodash/merge';
import lodashEach from 'lodash/each';
import { lookupFactory } from '../ol/lookupimagetile';
// import OlCluster from 'ol/source/Cluster';
// import { Circle as CircleStyle, Fill, Style } from 'ol/style';
// import olms from 'ol-mapbox-style';
// import Feature from 'ol/Feature';

export function mapLayerBuilder(models, config, cache, mapUi) {
  var self = {};
  self.init = function(Parent) {
    self.extentLayers = [];
    mapUi.events.on('selecting', hideWrap);
    mapUi.events.on('selectiondone', showWrap);
  };
  /**
   * Create a new OpenLayers Layer
   *
   * @method createLayer
   * @static
   * @param {object} def - Layer Specs
   * @param {object} options - Layer options
   * @returns {object} OpenLayers layer
   */
  self.createLayer = function(def, options) {
    var date, key, group, proj, layer, layerNext, layerPrior, attributes;
    options = options || {};
    group = options.group || null;
    date = self.closestDate(def, options);
    key = self.layerKey(def, options, group);
    proj = models.proj.selected;
    layer = cache.getItem(key);
    if (!layer) {
      // layer is not in the cache
      if (!date) date = options.date || models.date[models.date.activeDate];
      attributes = {
        id: def.id,
        key: key,
        date: date,
        proj: proj.id,
        def: def,
        group: group
      };
      def = lodashCloneDeep(def);
      lodashMerge(def, def.projections[proj.id]);
      if (def.type === 'wmts') {
        layer = createLayerWMTS(def, options);
        if (proj.id === 'geographic' && (def.wrapadjacentdays === true || def.wrapX)) {
          layerNext = createLayerWMTS(def, options, 1);
          layerPrior = createLayerWMTS(def, options, -1);

          layer.wv = attributes;
          layerPrior.wv = attributes;
          layerNext.wv = attributes;

          layer = new OlLayerGroup({
            layers: [layer, layerNext, layerPrior]
          });
        }
      } else if (def.type === 'vector') {
        // Add vector layer style to config.rendered object
        if (config.layers[def.id] && config.layers[def.id].vectorStyle) {
          styles.loadRenderedVectorStyle(config, def.id);
        }

        layer = createLayerVector(def, options, null);
        if (proj.id === 'geographic' && (def.wrapadjacentdays === true || def.wrapX)) {
          layerNext = createLayerVector(def, options, 1);
          layerPrior = createLayerVector(def, options, -1);

          layer.wv = attributes;
          layerPrior.wv = attributes;
          layerNext.wv = attributes;

          layer = new OlLayerGroup({
            layers: [layer, layerNext, layerPrior]
          });
        }
      } else if (def.type === 'wms') {
        layer = createLayerWMS(def, options);
        if (proj.id === 'geographic' && (def.wrapadjacentdays === true || def.wrapX)) {
          layerNext = createLayerWMS(def, options, 1);
          layerPrior = createLayerWMS(def, options, -1);

          layer.wv = attributes;
          layerPrior.wv = attributes;
          layerNext.wv = attributes;

          layer = new OlLayerGroup({
            layers: [layer, layerNext, layerPrior]
          });
        }
      } else {
        throw new Error('Unknown layer type: ' + def.type);
      }
      layer.wv = attributes;
      cache.setItem(key, layer);
      layer.setVisible(false);
    }
    layer.setOpacity(def.opacity || 1.0);
    return layer;
  };

  /**
   * Returns the closest date, from the layer's array of availableDates
   *
   * @param  {object} def     Layer definition
   * @param  {object} options Layer options
   * @return {object}         Closest date
   */
  self.closestDate = function(def, options) {
    var date;
    var animRange;
    if (models.anim) {
      animRange = models.anim.rangeState;
    }
    var dateArray = def.availableDates || [];
    if (options.date) {
      date = options.date;
    } else {
      date = models.date[models.date.activeDate];
      // If this not a subdaily layer, truncate the selected time to
      // UTC midnight
      if (def.period !== 'subdaily') {
        date = util.clearTimeUTC(date);
      }
    }
    // Perform extensive checks before finding closest date
    if (
      !options.precache &&
      (animRange && animRange.playing === false) &&
      ((def.period === 'daily' && models.date.selectedZoom > 3) ||
        (def.period === 'monthly' && models.date.selectedZoom >= 2) ||
        (def.period === 'yearly' && models.date.selectedZoom >= 1))
    ) {
      date = util.prevDateInDateRange(def, date, dateArray);

      // Is current "rounded" previous date not in array of availableDates
      if (date && !dateArray.includes(date)) {
        // Then, update layer object with new array of dates
        def.availableDates = util.datesinDateRanges(def, date, true);
        date = util.prevDateInDateRange(def, date, dateArray);
      }
    }
    return date;
  };

  /**
   * Create a layer key
   *
   * @function layerKey
   * @static
   * @param {Object} def - Layer properties
   * @param {number} options - Layer options
   * @param {boolean} precache
   * @returns {object} layer key Object
   */
  self.layerKey = function(def, options) {
    var date;
    var layerGroupStr;
    var layerId = def.id;
    var projId = models.proj.selected.id;
    var palette = '';
    layerGroupStr = options.group ? options.group : models.layers.activeLayers;
    // Don't key by time if this is a static layer--it is valid for
    // every date.
    if (def.period) {
      date = util.toISOStringSeconds(
        util.roundTimeOneMinute(self.closestDate(def, options))
      );
    }
    if (models.palettes.isActive(def.id)) {
      palette = models.palettes.key(def.id);
    }
    return [layerId, projId, date, palette, layerGroupStr].join(':');
  };
  /**
   * Create a new WMTS Layer
   * @method createLayerWMTS
   * @static
   * @param {object} def - Layer Specs
   * @param {object} options - Layer options
   * @returns {object} OpenLayers WMTS layer
   */
  var createLayerWMTS = function(def, options, day) {
    var proj, source, matrixSet, matrixIds, urlParameters, date, extent, start;
    proj = models.proj.selected;
    source = config.sources[def.source];
    extent = proj.maxExtent;
    start = [proj.maxExtent[0], proj.maxExtent[3]];
    if (!source) {
      throw new Error(def.id + ': Invalid source: ' + def.source);
    }
    matrixSet = source.matrixSets[def.matrixSet];
    if (!matrixSet) {
      throw new Error(def.id + ': Undefined matrix set: ' + def.matrixSet);
    }
    if (typeof def.matrixIds === 'undefined') {
      matrixIds = [];
      lodashEach(matrixSet.resolutions, function(resolution, index) {
        matrixIds.push(index);
      });
    } else {
      matrixIds = def.matrixIds;
    }

    if (day) {
      if (day === 1) {
        extent = [-250, -90, -180, 90];
        start = [-540, 90];
      } else {
        extent = [180, -90, 250, 90];
        start = [180, 90];
      }
    }

    date = options.date || models.date[models.date.activeDate];
    if (day) {
      date = util.dateAdd(date, 'day', day);
    }
    urlParameters =
      '?TIME=' + util.toISOStringSeconds(util.roundTimeOneMinute(date));

    var sourceOptions = {
      url: source.url + urlParameters,
      layer: def.layer || def.id,
      cacheSize: 4096,
      crossOrigin: 'anonymous',
      format: def.format,
      transition: 0,
      matrixSet: matrixSet.id,
      tileGrid: new OlTileGridWMTS({
        origin: start,
        resolutions: matrixSet.resolutions,
        matrixIds: matrixIds,
        tileSize: matrixSet.tileSize[0]
      }),
      wrapX: false,
      style: typeof def.style === 'undefined' ? 'default' : def.style
    };
    if (models.palettes.isActive(def.id, options.group)) {
      var lookup = models.palettes.getLookup(def.id, options.group);
      sourceOptions.tileClass = lookupFactory(lookup, sourceOptions);
    }
    return new OlLayerTile({
      preload: Infinity,
      extent: extent,
      source: new OlSourceWMTS(sourceOptions)
    });
  };

  /**
   * Create a new Vector Layer
   *
   * @method createLayerVector
   * @static
   * @param {object} def - Layer Specs
   * @param {object} options - Layer options
   * @returns {object} OpenLayers Vector layer
   */
  var createLayerVector = function(def, options, day) {
    var date, urlParameters, proj, extent, source, matrixSet, matrixIds, start;
    proj = models.proj.selected;
    source = config.sources[def.source];
    extent = proj.maxExtent;
    start = [proj.maxExtent[0], proj.maxExtent[3]];

    if (!source) {
      throw new Error(def.id + ': Invalid source: ' + def.source);
    }
    matrixSet = source.matrixSets[def.matrixSet];
    if (!matrixSet) {
      throw new Error(def.id + ': Undefined matrix set: ' + def.matrixSet);
    }
    if (typeof def.matrixIds === 'undefined') {
      matrixIds = [];
      lodashEach(matrixSet.resolutions, function(resolution, index) {
        matrixIds.push(index);
      });
    } else {
      matrixIds = def.matrixIds;
    }

    if (day) {
      if (day === 1) {
        extent = [-250, -90, -180, 90];
        start = [-540, 90];
      } else {
        extent = [180, -90, 250, 90];
        start = [180, 90];
      }
    }

    var layerName = def.layer || def.id;
    var tms = def.matrixSet;

    date = options.date || models.date[models.date.activeDate];
    if (day) {
      date = util.dateAdd(date, 'day', day);
    }

    urlParameters =
      '?' +
      'TIME=' +
      util.toISOStringSeconds(util.roundTimeOneMinute(date)) +
      '&layer=' +
      layerName +
      '&tilematrixset=' +
      tms +
      '&Service=WMTS' +
      '&Request=GetTile' +
      '&Version=1.0.0' +
      '&FORMAT=application%2Fvnd.mapbox-vector-tile' +
      '&TileMatrix={z}&TileCol={x}&TileRow={y}';

    var sourceOptions = new SourceVectorTile({
      url: source.url + urlParameters,
      layer: layerName,
      format: new MVT(),
      projection: 'EPSG:4326',
      tileGrid: new OlTileGridTileGrid({
        extent: extent,
        origin: start,
        resolutions: matrixSet.resolutions,
        tileSize: matrixSet.tileSize
      })
    });

    var layer = new LayerVectorTile({
      extent: extent,
      source: sourceOptions
    });

    if (config.vectorStyles && def.vectorStyle && def.vectorStyle.id) {
      var styleFunction;
      var vectorStyles = config.vectorStyles.rendered;
      var vectorStyle = def.vectorStyle.id;
      var glStyle = vectorStyles[vectorStyle];
      styleFunction = stylefunction(layer, glStyle, 'default_style');

      $(document).ready(function() {
        function getVals() {
          // Get slider values
          var parent = this.parentNode;
          var slides = parent.getElementsByTagName('input');
          var slide1 = parseFloat(slides[0].value);
          var slide2 = parseFloat(slides[1].value);
          // Neither slider will clip the other, so make sure we determine which is larger
          if (slide1 > slide2) { var tmp = slide2; slide2 = slide1; slide1 = tmp; }

          var displayElement = parent.getElementsByClassName('rangeValues')[0];
          displayElement.innerHTML = slide1 + ' - ' + slide2;
        }

        window.onload = function() {
          styleFunction = stylefunction(layer, glStyle, 'default_style');
          // Initialize Sliders
          var sliderSections = document.getElementsByClassName('range-slider');
          for (var x = 0; x < sliderSections.length; x++) {
            var sliders = sliderSections[x].getElementsByTagName('input');
            for (var y = 0; y < sliders.length; y++) {
              if (sliders[y].type === 'range') {
                sliders[y].oninput = getVals;
                // Manually trigger event first time to display values
                sliders[y].oninput();
              }
            }
          }

          let confidenceMinFilter = document.getElementById('confidenceMinFilter');
          let confidenceMaxFilter = document.getElementById('confidenceMaxFilter');

          document.getElementById('confidenceMinFilterLabel').innerHTML = confidenceMinFilter.value;
          document.getElementById('confidenceMaxFilterLabel').innerHTML = confidenceMaxFilter.value;
        };

        // TODO: Add check for date change and re-apply
        // TODO: Change this on chang to target the controls
        $(document).on('change', function(e) {
          glStyle = vectorStyles[vectorStyle];
          if (glStyle.name === 'FIRMS') {
            styleFunction = stylefunction(layer, glStyle, 'default_style');

            // FIRMS Style based on Confidence / FRP
            if (document.getElementById('frpCheckbox').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'MODIS_Fire_Points_FRP');
            } else if (document.getElementById('confidenceCheckbox').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'MODIS_Fire_Points_Confidence');
            } else {
              styleFunction = stylefunction(layer, glStyle, 'default_style');
            }

            // FIRMS Filters
            let confidenceMinFilter = document.getElementById('confidenceMinFilter');
            let confidenceMaxFilter = document.getElementById('confidenceMaxFilter');

            document.getElementById('confidenceMinFilterLabel').innerHTML = confidenceMinFilter.value;
            document.getElementById('confidenceMaxFilterLabel').innerHTML = confidenceMaxFilter.value;

            // Filter by a feature
            layer.setStyle(function(feature, resolution) {
              if (feature.get('CONFIDENCE') >= confidenceMinFilter.value && feature.get('CONFIDENCE') <= confidenceMaxFilter.value) {
                return styleFunction(feature, resolution);
              }
            });
          } else if (glStyle.name === 'Orbit Tracks') {
            if (document.getElementById('orbit-track-controls_yellow1').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'yellow1');
            } else if (document.getElementById('orbit-track-controls_yellow2').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'yellow2');
            } else if (document.getElementById('orbit-track-controls_orange1').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'orange1');
            } else if (document.getElementById('orbit-track-controls_orange2').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'orange2');
            } else if (document.getElementById('orbit-track-controls_orange3').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'orange3');
            } else if (document.getElementById('orbit-track-controls_red1').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'red1');
            } else if (document.getElementById('orbit-track-controls_red2').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'red2');
            } else if (document.getElementById('orbit-track-controls_red3').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'red3');
            } else if (document.getElementById('orbit-track-controls_pink1').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'pink1');
            } else if (document.getElementById('orbit-track-controls_pink2').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'pink2');
            } else if (document.getElementById('orbit-track-controls_pink3').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'pink3');
            } else if (document.getElementById('orbit-track-controls_pink4').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'pink4');
            } else if (document.getElementById('orbit-track-controls_pink5').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'pink5');
            } else if (document.getElementById('orbit-track-controls_purple1').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'purple1');
            } else if (document.getElementById('orbit-track-controls_purple2').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'purple2');
            } else if (document.getElementById('orbit-track-controls_purple3').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'purple3');
            } else if (document.getElementById('orbit-track-controls_blue1').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'blue1');
            } else if (document.getElementById('orbit-track-controls_blue2').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'blue2');
            } else if (document.getElementById('orbit-track-controls_blue3').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'blue3');
            } else if (document.getElementById('orbit-track-controls_blue4').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'blue4');
            } else if (document.getElementById('orbit-track-controls_blue5').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'blue5');
            } else if (document.getElementById('orbit-track-controls_blue6').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'blue6');
            } else if (document.getElementById('orbit-track-controls_brown1').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'brown1');
            } else if (document.getElementById('orbit-track-controls_brown2').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'brown2');
            } else if (document.getElementById('orbit-track-controls_green1').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'green1');
            } else if (document.getElementById('orbit-track-controls_green2').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'green2');
            } else if (document.getElementById('orbit-track-controls_green3').checked === true) {
              styleFunction = stylefunction(layer, glStyle, 'green3');
            } else {
              styleFunction = stylefunction(layer, glStyle, 'default_style');
            }

            // Filter time by 5 mins
            layer.setStyle(function(feature, resolution) {
              var minute;
              var minutes = feature.get('label');
              if (minutes) {
                minute = minutes.split(':');
              }
              if ((minute && minute[1] % 5 === 0) || feature.type_ === 'LineString') {
                console.log(feature);
                return styleFunction(feature, resolution);
              }
            });
          }
        });
      });
    }

    return layer;
  };

  /**
   * Create a new WMS Layer
   *
   * @method createLayerWMTS
   * @static
   * @param {object} def - Layer Specs
   * @param {object} options - Layer options
   * @returns {object} OpenLayers WMS layer
   */
  var createLayerWMS = function(def, options, day) {
    var proj,
      source,
      urlParameters,
      transparent,
      date,
      extent,
      start,
      res,
      parameters;
    proj = models.proj.selected;
    source = config.sources[def.source];
    extent = proj.maxExtent;
    start = [proj.maxExtent[0], proj.maxExtent[3]];
    res = proj.resolutions;
    if (!source) {
      throw new Error(def.id + ': Invalid source: ' + def.source);
    }

    transparent = def.format === 'image/png';
    if (proj.id === 'geographic') {
      res = [
        0.28125,
        0.140625,
        0.0703125,
        0.03515625,
        0.017578125,
        0.0087890625,
        0.00439453125,
        0.002197265625,
        0.0010986328125,
        0.00054931640625,
        0.00027465820313
      ];
    }
    if (day) {
      if (day === 1) {
        extent = [-250, -90, -180, 90];
        start = [-540, 90];
      } else {
        extent = [180, -90, 250, 90];
        start = [180, 90];
      }
    }
    parameters = {
      LAYERS: def.layer || def.id,
      FORMAT: def.format,
      TRANSPARENT: transparent,
      VERSION: '1.1.1'
    };
    if (def.styles) {
      parameters.STYLES = def.styles;
    }

    urlParameters = '';

    date = options.date || models.date[models.date.activeDate];
    if (day) {
      date = util.dateAdd(date, 'day', day);
    }
    urlParameters =
      '?TIME=' + util.toISOStringSeconds(util.roundTimeOneMinute(date));

    var sourceOptions = {
      url: source.url + urlParameters,
      cacheSize: 4096,
      wrapX: true,
      style: 'default',
      crossOrigin: 'anonymous',
      params: parameters,
      transition: 0,
      tileGrid: new OlTileGridTileGrid({
        origin: start,
        resolutions: res
      })
    };

    if (models.palettes.isActive(def.id, options.group)) {
      var lookup = models.palettes.getLookup(def.id, options.group);
      sourceOptions.tileClass = lookupFactory(lookup, sourceOptions);
    }
    var layer = new OlLayerTile({
      preload: Infinity,
      extent: extent,
      source: new OlSourceTileWMS(sourceOptions)
    });
    return layer;
  };
  var hideWrap = function() {
    var layer;
    var key;
    var layers;

    layers = models.layers[models.layers.activeLayers];

    for (var i = 0, len = layers.length; i < len; i++) {
      layer = layers[i];
      if ((layer.wrapadjacentdays || layer.wrapX) && layer.visible) {
        key = self.layerKey(layer, {
          date: models.date[models.date.activeDate]
        });
        layer = cache.getItem(key);
        if (!layer) {
          throw new Error(`no such layer in cache: ${key}`);
        }
        layer.setExtent([-180, -90, 180, 90]);
      }
    }
  };
  var showWrap = function() {
    var layer;
    var layers;
    var key;

    layers = models.layers[models.layers.activeLayers];
    for (var i = 0, len = layers.length; i < len; i++) {
      layer = layers[i];
      if ((layer.wrapadjacentdays || layer.wrapX) && layer.visible) {
        key = self.layerKey(layer, {
          date: models.date[models.date.activeDate]
        });
        layer = cache.getItem(key);
        layer.setExtent([-250, -90, 250, 90]);
      }
    }
  };
  self.init(mapUi);
  return self;
}

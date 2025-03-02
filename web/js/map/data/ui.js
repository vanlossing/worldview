import lodashSize from 'lodash/size';
import lodashEach from 'lodash/each';
import lodashFind from 'lodash/find';
import googleTagManager from 'googleTagManager';
import * as olExtent from 'ol/extent';
import { dataHandlerGetByName } from './handler';
import { dataMap } from './map';
import uiIndicator from '../../ui/indicator';
import util from '../../util/util';
import wvui from '../../ui/ui';
import { REL_DATA, REL_METADATA, REL_BROWSE, DATA_EXTS } from './cmr';
import * as DATA_CONSTANTS from '../../modules/data/constants';
import { CHANGE_TAB as CHANGE_SIDEBAR_TAB } from '../../modules/sidebar/constants';
import { toggleGranule } from '../../modules/data/actions';
import { SELECT_DATE } from '../../modules/date/constants';
import { LOCATION_POP_ACTION } from '../../redux-location-state-customs';
import { getLayers } from '../../modules/layers/selectors';
import { getDataProductsFromActiveLayers, doesSelectedExist } from '../../modules/data/selectors';
import * as LAYER_CONSTANTS from '../../modules/layers/constants';
import { CHANGE_PROJECTION } from '../../modules/projection/constants';

export function dataUi(store, ui, config) {
  var queryActive = false;
  var mapController = null;
  var selectionListPanel = null;
  var downloadListPanel = null;
  var lastResults = null;
  var maps = ui.map;
  var queryExecuting = false;
  var nextQuery = null;

  var indicators = {
    query: null,
    noneInView: null,
    noResults: null
  };

  var self = {};
  self.events = util.events();
  self.EVENT_QUERY = 'query';
  self.EVENT_QUERY_RESULTS = 'queryResults';
  self.EVENT_QUERY_CANCEL = 'queryCancel';
  self.EVENT_QUERY_ERROR = 'queryError';
  self.EVENT_QUERY_TIMEOUT = 'queryTimeout';
  self.selector = '#wv-data';
  self.id = 'wv-data';

  const subscribeToStore = function(action) {
    switch (action.type) {
      case CHANGE_PROJECTION:
        return changeProjection();
      case LOCATION_POP_ACTION:
      case CHANGE_SIDEBAR_TAB:
        return action.activeTab === 'download' ? onActivate() : mapController ? onDeactivate() : '';
      case DATA_CONSTANTS.DATA_GET_DATA_CLICK:
        return self.showDownloadList();
      case DATA_CONSTANTS.DATA_GRANULE_SELECT:
        self.events.trigger('granuleSelect', action.granule);
        return updateSelection();
      case DATA_CONSTANTS.DATA_GRANULE_UNSELECT:
        self.events.trigger('granuleUnselect', action.granule);
        return updateSelection();
      case LAYER_CONSTANTS.REMOVE_LAYER:
      case LAYER_CONSTANTS.RESET_LAYERS:
      case LAYER_CONSTANTS.ADD_LAYER:
      case LAYER_CONSTANTS.REORDER_LAYER_GROUP:
      case LAYER_CONSTANTS.ADD_LAYERS_FOR_EVENT:
        return updateLayers();
      case SELECT_DATE:
      case DATA_CONSTANTS.SELECT_PRODUCT:
        return query();
    }
  };
  var changeProjection = function() {
    updateLayers();
    query();
    self.events.trigger('projectionUpdate');
  };
  var updateLayers = function() {
    const state = store.getState();
    const { layers, compare, proj, data } = state;
    const activeString = compare.activeString;
    const activeLayers = getLayers(layers[activeString], { proj: proj.id }, state);

    // If a layer was removed and the product no longer exists,
    // remove any selected items in that product
    // FIXME: This is a hack for now and should be cleaned up when
    // everything changes to models.
    var products = getDataProductsFromActiveLayers(activeLayers, config, proj.id);
    lodashEach(data.selectedGranules, function(selected) {
      if (!products[selected.product] && !lodashFind(layers[activeString], { product: selected.product })) {
        store.dispatch(toggleGranule(selected));
      }
    });
  };
  var query = function() {
    const state = store.getState();
    const dataState = state.data;
    const { compare, layers, proj } = state;
    const activeLayers = getLayers(layers[compare.activeString], { proj: proj.id });

    if (state.sidebar.activeTab !== 'download') {
      return;
    }

    if (!dataState.selectedProduct || (dataState.selectedProduct && !doesSelectedExist(activeLayers, dataState.selectedProduct))) {
      self.events.trigger(self.EVENT_QUERY_RESULTS, {
        meta: {},
        granules: []
      });
      return;
    }

    var productConfig = config.products[dataState.selectedProduct];
    if (!productConfig) {
      throw Error('Product not defined: ' + dataState.selectedProduct);
    }

    var handlerFactory = dataHandlerGetByName(productConfig.handler);
    var handler = handlerFactory(config, store);
    handler.events
      .on('query', function() {
        self.events.trigger(self.EVENT_QUERY);
      })
      .on('results', function(results) {
        queryExecuting = false;
        if (self.active && !nextQuery) {
          self.events.trigger(self.EVENT_QUERY_RESULTS, results);
        }
        if (nextQuery) {
          var q = nextQuery;
          nextQuery = null;
          executeQuery(q);
        }
      })
      .on('error', function(textStatus, errorThrown) {
        queryExecuting = false;
        if (self.active) {
          self.events.trigger(self.EVENT_QUERY_ERROR, textStatus, errorThrown);
        }
      })
      .on('timeout', function() {
        queryExecuting = false;
        if (self.active) {
          self.events.trigger(self.EVENT_QUERY_TIMEOUT);
        }
      });
    executeQuery(handler);
  };

  var executeQuery = function(handler) {
    if (!queryExecuting) {
      try {
        queryExecuting = true;
        handler.submit();
      } catch (error) {
        queryExecuting = false;
        throw error;
      }
    } else {
      nextQuery = handler;
    }
  };
  var init = function() {
    ui.events.on('last-action', subscribeToStore);
    ui.map.events.on('extent', self.onViewChange);
    self.events.on('query', onQuery)
      .on('queryResults', (results) => {
        onQueryResults(results);
        self.onViewChange(results);
      })
      .on('queryError', onQueryError)
      .on('queryTimeout', onQueryTimeout);
  };
  self.onViewChange = function(results) {
    results = results || lastResults;
    const state = store.getState();
    var map = ui.map.selected;
    if (!state.data.active || queryActive || !results) {
      return;
    }
    if (results.granules.length === 0) {
      return;
    }
    var hasCentroids = false;
    var inView = false;
    var extent = map.getView().calculateExtent(map.getSize());
    var crs = state.proj.selected.crs;
    lodashEach(results.granules, function(granule) {
      if (granule.centroid && granule.centroid[crs]) {
        hasCentroids = true;
        if (olExtent.intersects(extent, granule.centroid[crs].getExtent())) {
          inView = true;
          return true;
        }
      }
    });
    uiIndicator.hide(indicators.noneInView);
    if (hasCentroids && !inView) {
      indicators.noneInView = uiIndicator.show('Zoom out or move map');
    }
  };
  var updateSelection = function() {
    if (downloadListPanel && downloadListPanel.visible()) {
      downloadListPanel.refresh();
    }
  };
  var onActivate = self.onActivate = function() {
    self.active = true;
    self.events.trigger('activate');
    if (!mapController) {
      mapController = dataMap(store, maps, self, ui);
    }
    query();
  };

  var onDeactivate = function() {
    self.active = false;
    uiIndicator.hide(indicators);
    if (selectionListPanel) {
      selectionListPanel.hide();
    }
    if (downloadListPanel) {
      downloadListPanel.hide();
    }
    mapController.dispose();
  };

  var onQuery = function() {
    queryActive = true;
    indicators.query = uiIndicator.searching(indicators);
    if (selectionListPanel) {
      selectionListPanel.hide();
    }
    if (downloadListPanel) {
      downloadListPanel.hide();
    }
  };

  var onQueryResults = function(results) {
    const dataState = store.getState().data;
    if (selectionListPanel) {
      selectionListPanel.hide();
      selectionListPanel = null;
    }
    queryActive = false;
    lastResults = results;
    uiIndicator.hide(indicators);
    var hasResults = true;
    if (dataState.selectedProduct !== null && results.granules.length === 0) {
      indicators.noData = uiIndicator.noData(indicators);
      hasResults = false;
    }
    if (results.meta.showList && hasResults) {
      selectionListPanel = dataUiSelectionListPanel(self, results, store);
      selectionListPanel.show();
    }
  };

  var onQueryError = function(status, error) {
    queryActive = false;
    uiIndicator.hide(indicators);
    if (status !== 'abort') {
      console.error('Unable to search', status, error);
      wvui.notify(
        'Unable to search at this time.<br/><br/>Please try ' + 'again later.'
      );
    }
  };

  var onQueryTimeout = function() {
    queryActive = false;
    uiIndicator.hide(indicators);
    wvui.notify(
      'No results received yet. This may be due to a ' +
        'connectivity issue. Please try again later.'
    );
  };

  self.showDownloadList = function() {
    if (selectionListPanel) {
      selectionListPanel.setVisible(false);
    }
    if (!downloadListPanel) {
      downloadListPanel = dataUiDownloadListPanel(config, store);
      downloadListPanel.events.on('close', function() {
        if (selectionListPanel) {
          selectionListPanel.setVisible(true);
        }
      });
    }
    downloadListPanel.show();
  };

  self.showUnavailableReason = function() {
    var headerMsg =
      "<h3 class='wv-data-unavailable-header'>Why are these layers not available for downloading?</h3>";
    var bodyMsg =
      'Some layers in Worldview do not have corresponding source data products available for download.  These include National Boundaries, Orbit Tracks, Earth at Night, and MODIS Corrected Reflectance products.<br><br>For a downloadable product similar to MODIS Corrected Reflectance, please try the MODIS Land Surface Reflectance layers available in Worldview.  If you would like to generate MODIS Corrected Reflectance imagery yourself, please see the following document: <a href="https://earthdata.nasa.gov/sites/default/files/field/document/MODIS_True_Color.pdf" target="_blank">https://earthdata.nasa.gov/sites/default/files/field/document/MODIS_True_Color.pdf</a><br><br>If you would like to download only an image, please use the "camera" icon in the upper right.<br><br> Data download will not work for "Terra and Aqua" Fires, select Terra only Fires and/or Aqua only Fires to download the associated data files.';

    wvui.notify(headerMsg + bodyMsg, 'Notice', 600);
  };

  init();
  return self;
}

var dataUiBulkDownloadPage = (function() {
  var ns = {};
  var pages = {
    wget: 'pages/wget.html',
    curl: 'pages/curl.html'
  };

  ns.show = function(selection, type) {
    var nonce = Date.now();
    var page = window.open(pages[type] + '?v=' + nonce, 'Worldview_' + nonce);

    var loaded = false;
    page.onload = function() {
      if (!loaded) {
        fillPage(page, selection, type);
        loaded = true;
      }
    };
    var checkCount = 0;
    var timer = setInterval(function() {
      checkCount++;
      if (loaded) {
        clearInterval(timer);
        return;
      }
      if (checkCount > 20) {
        clearInterval(timer);
        return;
      }
      if (fillPage(page, selection, type)) {
        loaded = true;
        clearInterval(timer);
      }
    }, 100);
  };

  var fillPage = function(page, selection, type) {
    var downloadLinks = [];
    var hosts = {};
    var indirectLinks = [];
    $.each(selection, function(index, product) {
      $.each(product.list, function(index2, granule) {
        var netrc = '';
        if (granule.urs) {
          netrc = '--netrc ';
        }
        $.each(granule.links, function(index2, link) {
          if (!link.data) {
            return;
          }
          if (product.noBulkDownload) {
            indirectLinks.push(
              "<li><a href='" + link.href + "'>" + link.href + '</a></li>'
            );
            return;
          }
          if (type === 'curl') {
            downloadLinks.push('curl --remote-name ' + netrc + link.href);
          } else {
            downloadLinks.push(link.href);
          }
          if (granule.urs) {
            // Get the hostname from the URL, the text between
            // the double slash and the first slash after that
            var host = /\/\/([^/]*)\//.exec(link.href);
            if (host) {
              hosts[host[1]] = true;
            }
          }
        });
      });
    });
    var links = page.document.getElementById('links');
    if (!links) return false;
    links.innerHTML = '<pre>' + downloadLinks.join('\n') + '</pre>';

    var netrcEntries = [];
    var hostnames = [];
    $.each(hosts, function(host) {
      netrcEntries.push(
        'machine ' + host + ' login URS_USER ' + 'password URS_PASSWORD'
      );
      hostnames.push(host);
    });
    if (netrcEntries.length > 0) {
      page.document.getElementById('netrc').innerHTML =
        '<pre>' + netrcEntries.join('\n') + '</pre>';
      page.document.getElementById('bulk-password-notice').style.display =
        'block';
      page.document.getElementById('netrc-instructions').style.display =
        'block';
      var instructions = page.document.getElementById(
        'fdm-password-instructions'
      );
      if (instructions) {
        instructions.style.display = 'block';
      }
      var machineNames = page.document.getElementById('fdm-machine-names');
      if (machineNames) {
        machineNames.innerHTML = '<pre>' + hostnames.join('\n') + '</pre>';
      }
    }
    if (indirectLinks.length > 0) {
      page.document.getElementById('indirect-instructions').style.display =
        'block';
      page.document.getElementById('indirect').innerHTML =
        '<ul>' + indirectLinks.join('\n') + '</ul>';
    }
    return true;
  };

  return ns;
})();

var dataUiDownloadListPanel = function(config, store) {
  var NOTICE =
    "<div id='wv-data-selection-notice'>" +
    "<i class='icon fa fa-info-circle fa-3x'></i>" +
    "<p class='text'>" +
    'Some items you have selected require a profile with ' +
    'Earthdata Login to download. ' +
    'It is simple and free to sign up! ' +
    "<a href='https://urs.earthdata.nasa.gov/users/new' target='urs'>" +
    'Click to register for a profile.</a>' +
    '</p>' +
    '</div>';

  var selection;
  var self = {};
  var urs = false;
  var $dialog;

  self.events = util.events();

  self.show = function() {
    $dialog = wvui.getDialog().attr('id', 'wv-data-selection');

    $dialog.dialog({
      title: 'Download Links',
      width: 650,
      height: 500,
      autoOpen: false,
      closeText: ''
    });
    var $bottomPane = $('<div></div>')
      .attr('id', 'wv-data-bulk-download-links')
      .addClass('ui-dialog-buttonpane')
      .addClass('ui-widget-content')
      .addClass('ui-helper-clearfix')
      .html(bulkDownloadText());
    $('#wv-data-selection').after($bottomPane);
    $('.ui-dialog .ui-dialog-titlebar-close').attr('tabindex', -1);

    $dialog.dialog('open');

    $('a.wget').click(showWgetPage);
    $('a.curl').click(showCurlPage);

    $dialog.find('.dd-collapse').accordion({
      collapsible: true,
      active: false,
      icons: {
        header: 'fas fa-caret-right fa-fw',
        activeHeader: 'fa fa-caret-down fa-fw'
      }
    });
    $dialog.on('dialogclose', function() {
      self.events.trigger('close');
    });
    self.refresh();
  };

  self.refresh = function() {
    const dataState = store.getState().data;
    selection = reformatSelection(dataState);
    $('#wv-data-selection').html(bodyText(selection));
    var bulkVisible =
      isBulkDownloadable() && lodashSize(dataState.selectedGranules) !== 0;
    if (bulkVisible) {
      $('wv-data-bulk-download-links').show();
    } else {
      $('wv-data-bulk-download-links').hide();
    }
    $('#wv-data-selection .remove').click(removeGranule);
    $('#wv-data-selection tr').on('mouseenter', onHoverOver);
    $('#wv-data-selection tr').on('mouseleave', onHoverOut);
  };

  self.hide = function() {
    var $d = $('.ui-dialog');
    if ($d.length !== 0) {
      $d.hide();
    }
  };

  self.visible = function() {
    var $d = $('.ui-dialog');
    if ($d.length !== 0) {
      return $d.is(':visible');
    }
    return false;
  };

  var reformatSelection = function(dataState) {
    var selection = {};

    urs = false;
    $.each(dataState.selectedGranules, function(key, granule) {
      if (granule.urs) {
        urs = true;
      }
      if (!selection[granule.product]) {
        var productConfig = config.products[granule.product];
        selection[granule.product] = {
          name: productConfig.name,
          granules: [granule],
          counts: {},
          noBulkDownload: productConfig.noBulkDownload || false
        };
      } else {
        selection[granule.product].granules.push(granule);
      }

      var product = selection[granule.product];

      // For each link that looks like metadata, see if that link is
      // repeated in all granules for that product. If so, we want to
      // bump that up to product level instead of at the granule level.
      $.each(granule.links, function(index, link) {
        // Formerly relied on metadata being correctly marked as data
        // via the cmr.REL_DATA constant;  unfortunately this wasn't
        // the case in practice so the following workaround was
        // implemented to check the link's file extension to see if
        // it looks like a data file
        var hrefExt = link.href
          .toLowerCase()
          .split('.')
          .slice(-1);
        if (hrefExt && hrefExt.length > 0) {
          hrefExt = hrefExt[0];
        }
        if (
          (DATA_EXTS.indexOf(hrefExt) === -1 && link.rel !== REL_BROWSE) ||
          link.rel === REL_METADATA
        ) {
          if (!product.counts[link.href]) {
            product.counts[link.href] = 1;
          } else {
            product.counts[link.href]++;
          }
        }
      });
    });

    $.each(selection, function(key, product) {
      product.links = [];
      product.list = [];

      // Some links found in a granule are not specific to that granule
      // and appear for every entry. If that is the case, hoist it up
      // to the product level instead. Every link in the results
      // are counted and this is true if the number of appearances is the
      // same as the number of granules. This check cannot be done
      // if there is only one granule returned.
      //
      // The code below checks for when the modulus is zero instead of
      // checking for equality. Not sure why this is the case but it
      // is probably important? Is there a case when a link appears
      // every other granule instead?
      if (product.granules.length > 1) {
        var granule = product.granules[0];
        $.each(granule.links, function(index, link) {
          var count = product.counts[link.href];
          if (count % product.granules.length === 0) {
            product.links.push(reformatLink(link));
          }
        });
      }

      $.each(product.granules, function(index, granule) {
        var item = {
          id: granule.id,
          label: granule.downloadLabel || granule.label,
          links: [],
          urs: granule.urs
        };
        $.each(granule.links, function(index, link) {
          // Skip this link if now at the product level
          var count = product.counts[link.href];
          if (count % product.granules.length === 0 && count !== 1) {
            return;
          }
          // Skip browse images per Kevin's request
          if (link.rel === REL_BROWSE) {
            return;
          }
          item.links.push(reformatLink(link));
        });
        product.list.push(item);
      });
      product.list.sort(function(a, b) {
        if (a.label > b.label) {
          return 1;
        }
        if (a.label < b.label) {
          return -1;
        }
        return 0;
      });
    });

    return selection;
  };

  var isBulkDownloadable = function() {
    var result = false;
    $.each(selection, function(index, product) {
      if (!product.noBulkDownload) {
        result = true;
      }
    });
    return result;
  };

  var reformatLink = function(link) {
    // For title, take it if found, otherwise, use the basename of the URI
    var titleVal = link.title;
    if (!link.title) {
      titleVal = link.href.split('/').slice(-1);

      // Handle special case where link is a directory which ends with /
      if (titleVal && titleVal.length && titleVal[0] === '') {
        titleVal = link.href;
      }
    }

    return {
      href: link.href,
      title: titleVal,
      data: link.rel === REL_DATA
    };
  };

  var linksText = function(links) {
    var elements = [];
    elements.push('<ul>');
    $.each(links, function(index, link) {
      elements.push(
        "<li class='link'><a href='" +
          link.href +
          "' target='_blank'>" +
          link.title +
          '</a></li>'
      );
    });
    elements.push('</ul>');
    return elements.join('\n');
  };

  var granuleText = function(product, granule) {
    var elements;
    if (product.name !== granule.label) {
      elements = [
        "<tr data-granule='" + granule.id + "'>",
        "<td><input type='button' class='remove' " +
          "data-granule='" +
          granule.id +
          "' " +
          "value='X'></input></td>",
        '<td><nobr><ul><li>' + granule.label + '</li></ul></nobr></td>',
        "<td class='wv-data-granule-link'>" +
          linksText(granule.links) +
          '</td>',
        '</tr>'
      ];
    } else {
      elements = [
        "<tr data-granule='" + granule.id + "'>",
        "<td><input type='button' class='remove' " +
          "data-granule='" +
          granule.id +
          "' " +
          "value='X'></input></td>",
        "<td colspan='2'>" + linksText(granule.links) + '</td>',
        '</tr>'
      ];
    }
    return elements.join('\n');
  };

  var productText = function(product) {
    var elements = ['<h3>' + product.name + '</h3>'];

    elements.push('<h5>Selected Data</h5>');
    elements.push('<table>');

    $.each(product.list, function(index, item) {
      elements.push(granuleText(product, item));
    });
    elements.push('</table>');

    if (product.links && product.links.length > 0) {
      elements.push('<h5>Data Collection Information</h5>');
      elements.push("<div class='product'>");
      elements.push(linksText(product.links));
      elements.push('</div>');
    }

    return elements.join('\n');
  };

  var bodyText = function() {
    const dataState = store.getState().data;

    if (lodashSize(dataState.selectedGranules) === 0) {
      return '<br/><h3>Selection Empty</h3>';
    }
    var elements = [];
    if (urs) {
      elements.push(NOTICE);
    }
    var products = [];
    $.each(selection, function(key, product) {
      products.push(productText(product));
    });
    elements.push(products.join('<br/><br/><br/>'));
    var text = elements.join('');
    return text;
  };

  var bulkDownloadText = function() {
    var bulk =
      "<div class='bulk dd-collapse'>" +
      '<h5>Bulk Download</h5>' +
      "<ul class='BulkDownload'>" +
      "<li><a class='link wget'>List of Links</a>: " +
      'for wget or download managers that accept a list of ' +
      'URLs</li>' +
      "<li><a class='link curl'>List of cURL Commands</a>: " +
      'can be copied and pasted to ' +
      'a terminal window to download using cURL.</li>' +
      '</ul>' +
      '</div>';
    return bulk;
  };

  var showWgetPage = function() {
    googleTagManager.pushEvent({
      event: 'data_download_list_wget'
    });
    dataUiBulkDownloadPage.show(selection, 'wget');
  };

  var showCurlPage = function() {
    googleTagManager.pushEvent({
      event: 'data_download_list_curl'
    });
    dataUiBulkDownloadPage.show(selection, 'curl');
  };

  var removeGranule = function() {
    var id = $(this).attr('data-granule');
    const dataState = store.getState().data;
    store.dispatch(toggleGranule(dataState.selectedGranules[id]));
    onHoverOut.apply(this);
  };

  var onHoverOver = function() {
    const dataState = store.getState().data;
    self.events.trigger(
      'hoverOver',
      dataState.selectedGranules[$(this).attr('data-granule')]
    );
  };

  var onHoverOut = function() {
    const dataState = store.getState().data;
    self.events.trigger(
      'hoverOut',
      dataState.selectedGranules[$(this).attr('data-granule')]
    );
  };

  return self;
};

var dataUiSelectionListPanel = function(dataUi, results, store) {
  var self = {};
  var granules = {};
  var $dialog;
  var init = function() {
    dataUi.events.on('granuleUnselect', onGranuleUnselect);
  };

  self.show = function() {
    $dialog = wvui.getDialog('wv-data-list');
    $dialog
      .attr('id', 'wv-data-list')
      .html(bodyText())
      .dialog({
        title: 'Select data',
        width: 400,
        height: 400,
        closeText: ''
      });
    $('button.ui-dialog-titlebar-close').hide();

    $.each(results.granules, function(index, granule) {
      granules[granule.id] = granule;
    });
    $('#wv-data-list input').on('click', toggleSelection);
  };

  self.hide = function() {
    var $d = $('.ui-dialog');
    if ($d.length !== 0) {
      $d.hide();
    }
  };

  self.visible = function() {
    var $d = $('.ui-dialog');
    if ($d.length !== 0) {
      return $d.is(':visible');
    }
    return false;
  };

  self.setVisible = function(value) {
    if (!value) {
      self.hide();
    } else {
      self.show();
    }
  };

  var resultsText = function() {
    var elements = [];
    const dataState = store.getState().data;
    $.each(results.granules, function(index, granule) {
      var selected = dataState.selectedGranules[granule.id] ? "checked='true'" : '';
      elements.push(
        '<tr>' +
          '<td>' +
          "<input type='checkbox' value='" +
          granule.id +
          "' " +
          selected +
          '>' +
          '</td>' +
          "<td class='label'>" +
          granule.label +
          '</td>' +
          '</tr>'
      );
    });
    var text = elements.join('\n');
    return text;
  };

  var bodyText = function() {
    var elements = ["<div'>", '<table>', resultsText(), '</table>', '</div>'];
    var text = elements.join('\n') + '<br/>';
    return text;
  };

  var toggleSelection = function() {
    var granule = granules[$(this).attr('value')];
    store.dispatch(toggleGranule(granule));
  };

  var onGranuleUnselect = function(granule) {
    $("#wv-data-list input[value='" + granule.id + "']").removeAttr('checked');
  };

  init();
  return self;
};

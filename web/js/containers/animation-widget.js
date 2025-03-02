import React from 'react';
import { connect } from 'react-redux';
import {
  find as lodashFind,
  get as lodashGet
} from 'lodash';
import googleTagManager from 'googleTagManager';
import util from '../util/util';
import ErrorBoundary from './error-boundary';
import PropTypes from 'prop-types';
import Slider, { Handle } from 'rc-slider';
import TimeSelector from '../components/date-selector/date-selector';
import LoopButton from '../components/animation-widget/loop-button';
import PlayButton from '../components/animation-widget/play-button';
import TimeScaleIntervalChange from '../components/timeline/timeline-controls/interval-timescale-change';
import CustomIntervalSelectorWidget from '../components/timeline/custom-interval-selector/interval-selector-widget';
import PlayQueue from '../components/animation-widget/play-queue';
import { Notify } from '../components/image-download/notify';
import { promiseImageryForTime } from '../modules/map/selectors';
import GifContainer from './gif';
import {
  selectDate,
  selectInterval,
  changeCustomInterval,
  toggleCustomModal
} from '../modules/date/actions';
import {
  timeScaleFromNumberKey,
  timeScaleToNumberKey,
  customModalType
} from '../modules/date/constants';
import { getQueueLength, getMaxQueueLength } from '../modules/animation/util';
import {
  hasSubDaily as hasSubDailySelector,
  getLayers
} from '../modules/layers/selectors';
import {
  play,
  onClose,
  stop,
  toggleLooping,
  changeFrameRate,
  changeStartDate,
  changeEndDate,
  changeStartAndEndDate,
  toggleComponentGifActive
} from '../modules/animation/actions';
import { notificationWarnings } from '../modules/image-download/constants';
import { onToggle, openCustomContent } from '../modules/modal/actions';
import { clearCustoms } from '../modules/palettes/actions';
import { clearRotate } from '../modules/map/actions';
import { clearGraticule } from '../modules/layers/actions';
import { hasCustomPaletteInActiveProjection } from '../modules/palettes/util';
import { Tooltip } from 'reactstrap';

const RangeHandle = props => {
  const { value, offset, dragging, ...restProps } = props;

  const positionStyle = {
    position: 'absolute',
    left: `${(offset - 5).toFixed(2)}%`
  };

  return (
    <React.Fragment>
      <span className="anim-frame-rate-label" style={positionStyle}>
        {value < 10 ? value.toFixed(1) : value}
      </span>
      <Handle
        dragging={dragging.toString()}
        value={value}
        offset={offset}
        {...restProps}
      />
    </React.Fragment>
  );
};

/*
 * A react component, Builds a rather specific
 * interactive widget
 *
 * @class AnimationWidget
 * @extends React.Component
 */
class AnimationWidget extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      speed: props.speed,
      isSliding: false,
      isGifActive: false,
      hoverGif: false,
      customIntervalModalOpen: false
    };
    this.onDateChange = this.onDateChange.bind(this);
    this.onIntervalSelect = this.onIntervalSelect.bind(this);
    this.onLoop = this.onLoop.bind(this);
    this.openGif = this.openGif.bind(this);
    this.toggleHoverGif = this.toggleHoverGif.bind(this);
  }

  static getDerivedStateFromProps(props, state) {
    if (props.speed !== state.speed && !state.isSliding) {
      return { speed: props.speed };
    } else return null;
  }

  getPromise(bool, type, action, title) {
    const { notify } = this.props;
    if (bool) {
      return notify(type, action);
    } else {
      return Promise.resolve(type);
    }
  }

  openGif() {
    const {
      toggleGif,
      onUpdateStartAndEndDate,
      hasCustomPalettes,
      isRotated,
      hasGraticule,
      numberOfFrames
    } = this.props;
    const {
      startDate,
      endDate
    } = this.zeroDates();

    if (numberOfFrames >= 40) {
      return;
    }

    this.getPromise(hasCustomPalettes, 'palette', clearCustoms, 'Notice').then(
      () => {
        this.getPromise(
          isRotated,
          'rotate',
          clearRotate,
          'Reset rotation'
        ).then(() => {
          this.getPromise(
            hasGraticule,
            'graticule',
            clearGraticule,
            'Remove Graticule?'
          ).then(() => {
            onUpdateStartAndEndDate(startDate, endDate);
          }).then(() => {
            googleTagManager.pushEvent({
              event: 'GIF_create_animated_button'
            });
            toggleGif();
          });
        });
      }
    );
  }

  /*
   * Sets a new state to say whether or not
   * the animation should loop
   *
   * @method onLoop
   *
   * @param {Object} component - slider react
   *  component
   * @param {number} value - Value of the slider
   *  selection
   *
   * @return {void}
   */
  onLoop() {
    var loop = true;
    if (this.state.looping) {
      loop = false;
    }
    this.props.onPushLoop(loop);
  }

  onDateChange(date, id) {
    const { onUpdateStartDate, onUpdateEndDate } = this.props;
    if (id === 'start') {
      onUpdateStartDate(date);
    } else {
      onUpdateEndDate(date);
    }
  }

  /*
   * Changes selected default or custom interval in header and
   * changes left/right date arrow increments
   *
   * @method onIntervalSelect
   *
   * @param {string} timeScale - clicked header string (ex: 'day', 'year', '12 day')
   *  component
   *
   * @return {void}
   */

  onIntervalSelect(timeScale, openModal) {
    let delta;
    const { customInterval, customDelta } = this.props;
    const customSelected = timeScale === 'custom';

    if (openModal) {
      this.toggleCustomIntervalModal(openModal);
      return;
    }

    if (customSelected && customInterval && customDelta) {
      timeScale = customInterval;
      delta = customDelta;
    } else {
      timeScale = Number(timeScaleToNumberKey[timeScale]);
      delta = 1;
    }
    this.props.onIntervalSelect(delta, timeScale, customSelected);
  }

  /*
   * update global store startDate, endDate, and isPlaying
   *
   * @method onPushPlay
   *
   * @return {void}
   */
  onPushPlay = () => {
    const {
      onUpdateStartAndEndDate,
      onPushPlay
    } = this.props;
    const {
      startDate,
      endDate
    } = this.zeroDates();
    onUpdateStartAndEndDate(startDate, endDate);
    onPushPlay();
  }

  /*
   * Zeroes start and end animation dates to UTC 00:00:00 for predictable animation range
   * subdaily intervals retain hours and minutes
   *
   * @method zeroDates
   *
   * @return {Object}
    * @param {Object} JS Date - startDate
    * @param {Object} JS Date - endDate
   */
  zeroDates = () => {
    let {
      subDailyMode,
      startDate,
      endDate
    } = this.props;
    if (subDailyMode) {
      // for subdaily, zero start and end dates to UTC XX:YY:00:00
      startDate.setUTCSeconds(0);
      startDate.setUTCMilliseconds(0);
      endDate.setUTCSeconds(0);
      endDate.setUTCMilliseconds(0);
    } else {
      // for nonsubdaily, zero start and end dates to UTC 00:00:00:00
      startDate = util.clearTimeUTC(startDate);
      endDate = util.clearTimeUTC(endDate);
    }
    return {
      startDate,
      endDate
    };
  }

  /**
  * @desc show/hide custom interval modal
  * @param {Boolean} isOpen
  * @returns {void}
  */
  toggleCustomIntervalModal = (isOpen) => {
    const { toggleCustomModal } = this.props;
    toggleCustomModal(isOpen, customModalType.ANIMATION);
  };

  /**
  * @desc handle SET of custom time scale panel
  * @param {Number} delta
  * @param {Number} timeScale
  * @returns {void}
  */
  changeCustomInterval = (delta, timeScale) => {
    this.props.changeCustomInterval(delta, timeScale);
  };

  toggleHoverGif() {
    const hoverState = this.state.hoverGif;
    this.setState({ hoverGif: !hoverState });
  }

  renderToolTip() {
    const { numberOfFrames } = this.props;
    const { hoverGif } = this.state;
    const elemExists = document.querySelector('#create-gif-button');
    const showTooltip = elemExists && hoverGif && numberOfFrames >= 40;
    return (
      <Tooltip
        placement="right"
        isOpen={showTooltip}
        target="create-gif-button">
          Too many frames were selected. <br/>
          Please request less than 40 frames if you would like to generate a GIF.
      </Tooltip>
    );
  }

  render() {
    const {
      looping,
      isPlaying,
      maxDate,
      minDate,
      sliderLabel,
      startDate,
      endDate,
      onPushPause,
      isActive,
      layers,
      hasCustomPalettes,
      promiseImageryForTime,
      map,
      selectDate,
      currentDate,
      toggleGif,
      isGifActive,
      subDailyMode,
      delta,
      interval,
      customSelected,
      customDelta,
      customInterval,
      numberOfFrames,
      animationCustomModalOpen,
      hasSubdailyLayers
    } = this.props;
    if (!isActive) {
      return '';
    } else if (isGifActive) {
      return <GifContainer onClose={toggleGif} />;
    } else {
      const maxLength = getMaxQueueLength(this.state.speed);
      const queueLength = getQueueLength(
        startDate,
        endDate,
        this.state.speed,
        interval,
        delta
      );
      const gifDisabled = numberOfFrames >= 40;

      return (
        <ErrorBoundary>
          {isPlaying ? (
            <PlayQueue
              endDate={endDate}
              loop={looping}
              isPlaying={isPlaying}
              currentDate={currentDate}
              canPreloadAll={queueLength <= maxLength}
              startDate={startDate}
              hasCustomPalettes={hasCustomPalettes}
              map={map}
              maxQueueLength={maxLength}
              queueLength={queueLength}
              layers={layers}
              interval={interval}
              delta={delta}
              speed={this.state.speed}
              selectDate={selectDate}
              togglePlaying={onPushPause}
              promiseImageryForTime={promiseImageryForTime}
              onClose={onPushPause}
            />
          ) : null}
          <div
            id="wv-animation-widget"
            className={'wv-animation-widget' + (subDailyMode ? ' subdaily' : '')}
          >
            <div className="wv-animation-widget-header">
              {'Animate Map in '}
              <TimeScaleIntervalChange
                setTimeScaleIntervalChangeUnit={this.onIntervalSelect}
                customIntervalZoomLevel={timeScaleFromNumberKey[customInterval]}
                customSelected={customSelected}
                customDelta={customDelta}
                timeScaleChangeUnit={interval}
                hasSubdailyLayers={hasSubdailyLayers}
              />
              {' Increments'}
            </div>

            <PlayButton
              playing={isPlaying}
              play={this.onPushPlay}
              pause={onPushPause}
            />
            <LoopButton looping={looping} onLoop={this.onLoop} />
            <div className="wv-slider-case">
              <Slider
                className="input-range"
                step={0.5}
                max={10}
                min={0.5}
                value={this.state.speed}
                onChange={num => this.setState({ speed: num })}
                handle={RangeHandle}
                onBeforeChange={() => this.setState({ isSliding: true })}
                onAfterChange={() => {
                  this.setState({ isSliding: false });
                  this.props.onSlide(this.state.speed);
                }}
              />
              <span className="wv-slider-label">{sliderLabel}</span>
            </div>
            <a
              id="create-gif-button"
              title={!gifDisabled ? 'Create Animated GIF' : ''}
              className={gifDisabled ? 'wv-icon-case disabled' : 'wv-icon-case'}
              onClick={this.openGif}
              onMouseEnter={this.toggleHoverGif}
              onMouseLeave={this.toggleHoverGif}
            >
              <i
                id="wv-animation-widget-file-video-icon"
                className="fas fa-file-video wv-animation-widget-icon"
              />
            </a>
            {this.renderToolTip()}
            <div className="wv-anim-dates-case">
              <TimeSelector
                id="start"
                idSuffix="animation-widget-start"
                width="120"
                height="30"
                date={startDate}
                onDateChange={this.onDateChange}
                maxDate={endDate}
                minDate={minDate}
                subDailyMode={subDailyMode}
              />
              <div className="thru-label">To</div>

              <TimeSelector
                id="end"
                idSuffix="animation-widget-end"
                width="120"
                height="30"
                date={endDate}
                onDateChange={this.onDateChange}
                maxDate={maxDate}
                minDate={startDate}
                subDailyMode={subDailyMode}
              />
            </div>
            <i className="fa fa-times wv-close" onClick={this.props.onClose} />
            <CustomIntervalSelectorWidget
              customDelta={customDelta}
              customIntervalZoomLevel={customInterval}
              customIntervalModalOpen={animationCustomModalOpen}
              changeCustomInterval={this.changeCustomInterval}
              hasSubdailyLayers={hasSubdailyLayers}
            />
          </div>
        </ErrorBoundary>
      );
    }
  }
}
function mapStateToProps(state) {
  const {
    layers,
    compare,
    animation,
    date,
    sidebar,
    modal,
    palettes,
    config,
    map,
    proj,
    browser
  } = state;
  const { startDate, endDate, speed, loop, isPlaying, isActive, gifActive } = animation;
  let {
    customSelected,
    interval,
    delta,
    customInterval,
    customDelta,
    appNow,
    animationCustomModalOpen
  } = date;
  const activeStr = compare.activeString;
  const activeDateStr = compare.isCompareA ? 'selected' : 'selectedB';
  const hasSubdailyLayers = hasSubDailySelector(layers[activeStr]);
  const activeLayersForProj = getLayers(
    layers[activeStr],
    { proj: proj.id },
    state
  );
  const hasCustomPalettes = hasCustomPaletteInActiveProjection(
    activeLayersForProj,
    palettes[activeStr]
  );
  const minDate = new Date(config.startDate);
  const maxDate = appNow;
  const animationIsActive = isActive &&
    browser.greaterThan.small &&
    lodashGet(map, 'ui.selected.frameState_') &&
    sidebar.activeTab !== 'download' && // No Animation when data download is active
    !compare.active &&
    !(modal.isOpen && modal.id === 'TOOLBAR_SNAPSHOT'); // No Animation when Image download is open

  if (!hasSubdailyLayers) {
    interval = interval > 3 ? 3 : interval;
    customInterval = customInterval > 3 ? 3 : customInterval;
  }
  const useInterval = customSelected ? customInterval || 3 : interval;
  const subDailyInterval = useInterval > 3;
  const subDailyMode = subDailyInterval && hasSubdailyLayers;
  const numberOfFrames = util.getNumberOfDays(
    startDate,
    endDate,
    timeScaleFromNumberKey[useInterval],
    customSelected && customDelta ? customDelta : delta
  );

  return {
    animationCustomModalOpen,
    customSelected,
    startDate,
    endDate,
    currentDate: date[activeDateStr],
    minDate,
    maxDate,
    isActive: animationIsActive,
    hasSubdailyLayers,
    subDailyMode,
    delta: customSelected && customDelta ? customDelta : delta,
    interval: timeScaleFromNumberKey[useInterval] || 'day',
    customDelta: customDelta || 1,
    customInterval: customInterval || 3,
    numberOfFrames,
    sliderLabel: 'Frames Per Second',
    layers: getLayers(layers[activeStr], {}, state),
    speed,
    isPlaying,
    looping: loop,
    hasCustomPalettes,
    map,
    promiseImageryForTime: (date, layers) => {
      return promiseImageryForTime(date, layers, state);
    },
    isGifActive: gifActive,
    isCompareActive: compare.active,
    isRotated: Boolean(map.rotation !== 0),
    hasGraticule: Boolean(
      lodashGet(
        lodashFind(layers[activeStr], { id: 'Graticule' }) || {},
        'visible'
      )
    )
  };
}
const mapDispatchToProps = dispatch => ({
  selectDate: val => {
    dispatch(selectDate(val));
  },
  notify: (type, action, title) => {
    return new Promise((resolve, reject, cancel) => {
      const bodyComponentProps = {
        bodyText: notificationWarnings[type],
        cancel: () => {
          dispatch(onToggle());
        },
        accept: () => {
          dispatch(action());
          dispatch(onToggle());
          resolve();
        }
      };
      dispatch(
        openCustomContent('image_download_notify_' + type, {
          headerText: 'Notify',
          bodyComponent: Notify,
          size: 'sm',
          modalClassName: 'notify',
          bodyComponentProps
        })
      );
    });
  },
  onClose: () => {
    dispatch(onClose());
  },
  onPushPlay: () => {
    dispatch(play());
  },
  onPushPause: () => {
    dispatch(stop());
  },
  onPushLoop: () => {
    dispatch(toggleLooping());
  },
  toggleGif: () => {
    dispatch(toggleComponentGifActive());
  },
  toggleCustomModal: (open, toggleBy) => {
    dispatch(toggleCustomModal(open, toggleBy));
  },
  onSlide: num => {
    dispatch(changeFrameRate(num));
  },
  onIntervalSelect: (delta, timeScale, customSelected) => {
    dispatch(selectInterval(delta, timeScale, customSelected));
  },
  changeCustomInterval: (delta, timeScale) => {
    dispatch(changeCustomInterval(delta, timeScale));
  },
  onUpdateStartDate(date) {
    dispatch(changeStartDate(date));
  },
  onUpdateEndDate(date) {
    dispatch(changeEndDate(date));
  },
  onUpdateStartAndEndDate: (startDate, endDate) => {
    dispatch(changeStartAndEndDate(startDate, endDate));
  }
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(AnimationWidget);

RangeHandle.propTypes = {
  dragging: PropTypes.object,
  offset: PropTypes.number,
  value: PropTypes.number
};
AnimationWidget.propTypes = {
  animationCustomModalOpen: PropTypes.bool,
  changeCustomInterval: PropTypes.func,
  currentDate: PropTypes.object,
  customDelta: PropTypes.number,
  customInterval: PropTypes.number,
  customSelected: PropTypes.bool,
  delta: PropTypes.number,
  endDate: PropTypes.object,
  hasCustomPalettes: PropTypes.bool,
  hasGraticule: PropTypes.bool,
  hasSubdailyLayers: PropTypes.bool,
  interval: PropTypes.string,
  isActive: PropTypes.bool,
  isCompareActive: PropTypes.bool,
  isGifActive: PropTypes.bool,
  isPlaying: PropTypes.bool,
  isRotated: PropTypes.bool,
  layers: PropTypes.array,
  looping: PropTypes.bool,
  map: PropTypes.object,
  maxDate: PropTypes.object,
  minDate: PropTypes.object,
  notify: PropTypes.func,
  numberOfFrames: PropTypes.number,
  onClose: PropTypes.func,
  onDateChange: PropTypes.func,
  onIntervalSelect: PropTypes.func,
  onPushLoop: PropTypes.func,
  onPushPause: PropTypes.func,
  onPushPlay: PropTypes.func,
  onSlide: PropTypes.func,
  onUpdateEndDate: PropTypes.func,
  onUpdateStartAndEndDate: PropTypes.func,
  onUpdateStartDate: PropTypes.func,
  promiseImageryForTime: PropTypes.func,
  selectDate: PropTypes.func,
  sliderLabel: PropTypes.string,
  speed: PropTypes.number,
  startDate: PropTypes.object,
  subDailyMode: PropTypes.bool,
  toggleCustomModal: PropTypes.func,
  toggleGif: PropTypes.func
};

import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
// import { openCustomContent } from '../../modules/modal/actions';
import { history } from '../../main';
import update from 'immutability-helper';
import { showNextToast, showPrevToast, hideToast } from '../../modules/tutorial-toast/actions';
import { Button, Toast, ToastHeader, ToastBody } from 'reactstrap';

class TutorialToast extends React.Component {
  render() {
    const {
      showToast,
      nextToast,
      prevToast,
      finishTutorial,
      currentToast,
      addLayer,
      setTime,
      prepareAnimate
    } = this.props;
    const currentToastClass = `wv-tutorial-toast wv-geostationary-toast step-${currentToast}`;

    return showToast && (
      <>
        <Toast isOpen={currentToast === 1} className={currentToastClass}>
          <ToastHeader toggle={this.toggleToast}>Featured Layers - Geostationary</ToastHeader>
          <ToastBody>
            <p>
              Our latest release includes a number of new layers for geostationary products.  These new layers
              can be found in the new &quot;Featured&quot; tab of the &quot;Add Layers&quot; menu.
            </p>
            <p>
              To jump right in, <a href="#" onClick={addLayer}>click here to add a geostationary layer</a> to the
              currently active overlays.
            </p>
            <div className="wv-toast-btn-container">
              <Button
                className="btn-sm wv-toast-btn wv-toast-btn-next"
                onClick={nextToast}>Next
              </Button>
            </div>
          </ToastBody>
        </Toast>

        <Toast isOpen={currentToast === 2} className={currentToastClass}>
          <ToastHeader toggle={this.toggleToast}> Sub-daily Timeline </ToastHeader>
          <ToastBody>
            <p>Geostationary products are updated more frequently than others.  For example, the set of GOES East
                and GOES West layers included in this release are updated in increments of 10 minutes. </p>
            <p>To take full advantage of this, the time and timescale of the timeline can now be set down to the hour and minute
                whenever any geostatinary products are in the current list of overlays. </p>
            <p> For an optimal experience, <a href="#" onClick={setTime}>click here to set a custom interval</a> to match the
                GOES East Red Visible layer&apos;s interval time of 10 minutes.</p>
            <div className="wv-toast-btn-container">
              <Button
                className="btn-sm wv-toast-btn wv-toast-btn-prev"
                onClick={prevToast}>Prev
              </Button>
              <Button
                className="btn-sm wv-toast-btn wv-toast-btn-next"
                onClick={() => {
                  prepareAnimate();
                  nextToast();
                }}> Next
              </Button>
            </div>
          </ToastBody>
        </Toast>

        <Toast isOpen={currentToast === 3} className={currentToastClass}>
          <ToastHeader toggle={this.toggleToast}>Animation</ToastHeader>
          <ToastBody>
            <p>Of course, the animation tool has also been updated to allow adjustments down to the hours and minutes as well.
              Click the play button to see geostationary in action!
            </p>
            <div className="wv-toast-btn-container">
              <Button
                className="btn-sm wv-toast-btn wv-toast-btn-prev"
                onClick={prevToast}>Prev
              </Button>
              <Button
                className="btn-sm wv-toast-btn wv-toast-btn-next"
                onClick={finishTutorial}>Done
              </Button>
            </div>
          </ToastBody>
        </Toast>
      </>
    );
  }
}

const getLocation = (search) => {
  search = search.split('/?').pop();
  const location = update(history.location, {
    search: { $set: search }
  });
  return location;
};

const mapDispatchToProps = (dispatch) => ({
  // openProducts: () => {
  //   dispatch(
  //     openCustomContent('LAYER_PICKER_COMPONENT', {
  //       headerText: null,
  //       modalClassName: 'custom-layer-dialog light',
  //       backdrop: false,
  //       CompletelyCustomModal: ProductPicker,
  //       wrapClassName: ''
  //     })
  //   );
  // },
  addLayer: () => {
    const paramArr = [
      'p=geographic&',
      'l=GOES-East_ABI_Band2_Red_Visible,Reference_Labels(hidden),Reference_Features(hidden),Coastlines,VIIRS_SNPP_CorrectedReflectance_TrueColor(hidden),MODIS_Aqua_CorrectedReflectance_TrueColor(hidden),MODIS_Terra_CorrectedReflectance_TrueColor&',
      't=2019-09-01-T20%3A00%3A41Z&'
    ];
    const urlParams = paramArr.reduce((prev, curr) => prev + curr, '');
    const location = getLocation(urlParams);
    dispatch({ type: 'REDUX-LOCATION-POP-ACTION', payload: location });
  },
  setTime: () => {
    const paramArr = [
      'p=geographic&',
      'l=GOES-East_ABI_Band2_Red_Visible,Reference_Labels(hidden),Reference_Features(hidden),Coastlines,VIIRS_SNPP_CorrectedReflectance_TrueColor(hidden),MODIS_Aqua_CorrectedReflectance_TrueColor(hidden),MODIS_Terra_CorrectedReflectance_TrueColor&',
      't=2019-09-01-T20%3A00%3A41Z&',
      'z=5&ics=true&ici=5&icd=10&t=2019-09-01-T20%3A00%3A41Z'
    ];
    const urlParams = paramArr.reduce((prev, curr) => prev + curr, '');
    const location = getLocation(urlParams);
    dispatch({ type: 'REDUX-LOCATION-POP-ACTION', payload: location });
  },
  prepareAnimate: () => {
    const paramArr = [
      'p=geographic&',
      'l=GOES-East_ABI_Band2_Red_Visible,Reference_Labels(hidden),Reference_Features(hidden),Coastlines,VIIRS_SNPP_CorrectedReflectance_TrueColor(hidden),MODIS_Aqua_CorrectedReflectance_TrueColor(hidden),MODIS_Terra_CorrectedReflectance_TrueColor&',
      't=2019-09-01-T20%3A00%3A41Z&',
      'v=-86.93586254108634,22.191846804617647,-70.13996410358634,33.95161242961765&',
      'z=5&ics=true&ici=5&icd=10&t=2019-09-01-T20%3A00%3A41Z&',
      'ab=on&as=2019-09-01-T16%3A00%3A00Z&ae=2019-09-01-T21%3A00%3A00Z&al=true'
    ];
    const urlParams = paramArr.reduce((prev, curr) => prev + curr, '');
    const location = getLocation(urlParams);
    dispatch({ type: 'REDUX-LOCATION-POP-ACTION', payload: location });
  },
  nextToast: () => {
    dispatch(showNextToast());
  },
  prevToast: () => {
    dispatch(showPrevToast());
  },
  finishTutorial: () => {
    dispatch(hideToast());
  }
});

const mapStateToProps = (state, ownProps) => {
  return {
    currentToast: state.tutorialToast.currentToast,
    showToast: state.tutorialToast.showToast
  };
};

TutorialToast.propTypes = {
  addLayerSetTime: PropTypes.func,
  currentToast: PropTypes.number,
  finishTutorial: PropTypes.func,
  nextToast: PropTypes.func,
  openProducts: PropTypes.func,
  prepareAnimate: PropTypes.func,
  prevToast: PropTypes.func,
  setTime: PropTypes.func,
  showToast: PropTypes.bool
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(TutorialToast);

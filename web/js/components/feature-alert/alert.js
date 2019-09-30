import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import AlertUtil from '../util/alert';
import util from '../../util/util';
import { showFirstToast } from '../../modules/tutorial-toast/actions';
import TutorialToast from '../../containers/tutorial-toast/tutorial-toast.js';

class FeaturedAlert extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      showAlert: true
    };
    this.dismissAlert = this.dismissAlert.bind(this);

    if (util.browser.localStorage) {
      // const hideAlertTime = localStorage.getItem('featured-alert');
    }
  }

  dismissAlert() {
    if (util.browser.localStorage) {
      localStorage.setItem('featured-alert', new Date());
    }
    this.setState({ showAlert: false });
  }

  readMore() {
    this.props.startTutorial();
  }

  render() {
    const { showAlert } = this.state;
    return (
      <>
        <AlertUtil
          isOpen={showAlert}
          iconClassName='fa fa-layer-group fa-fw'
          onClick={this.readMore.bind(this)}
          // TODO consider hiding the close button if no onDismiss prop supplied
          onDismiss={this.dismissAlert}
          message="Check out our new geostationary layers!"
        />
        <TutorialToast/>
      </>
    );
  }
}

const mapDispatchToProps = (dispatch) => ({
  startTutorial: () => {
    dispatch(showFirstToast());
  }
});

FeaturedAlert.propTypes = {
  buildDate: PropTypes.number,
  startTutorial: PropTypes.func
};

export default connect(
  null,
  mapDispatchToProps
)(FeaturedAlert);

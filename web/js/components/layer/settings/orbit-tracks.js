import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Checkbox } from '../../util/checkbox';
import { addOrbitTrack, removeLayer } from '../../../modules/layers/actions';

class OrbitTracksToggle extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  render() {
    const {
      layer,
      trackLayers,
      addOrbitTrack,
      removeLayer,
      activeLayers
    } = this.props;

    return (
      <div className="settings-component orbit-track-settings">
        <h2 className="wv-header">Orbit Tracks</h2>
        { trackLayers.map(track => {
          const isEnabled = activeLayers.some(l => l.id === track.id);
          const onCheck = () => {
            if (isEnabled) {
              removeLayer(track.id);
            } else {
              addOrbitTrack(track.id, layer);
            }
          };
          return (
            <Checkbox
              // id="wv-orbit-track"
              key={track.id}
              classNames="wv-orbit-track"
              title="Enable/disable orbit tracks for this layer"
              checked={isEnabled}
              onCheck={onCheck}
              label={track.title}
            />
          );
        }) }
      </div>
    );
  }
}

function mapStateToProps(state, ownProps) {
  const { config, compare, layers } = state;
  const trackLayers = ownProps.layer.tracks.map(trackName => config.layers[trackName]);
  const activeString = compare.isCompareA ? 'active' : 'activeB';
  const activeLayers = layers[activeString];

  return {
    trackLayers,
    activeLayers
  };
}
const mapDispatchToProps = dispatch => ({
  addOrbitTrack: (trackId, layerId) => {
    dispatch(addOrbitTrack(trackId, layerId));
  },
  removeLayer: (id) => {
    dispatch(removeLayer(id));
  }
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(OrbitTracksToggle);

OrbitTracksToggle.defaultProps = {
};
OrbitTracksToggle.propTypes = {
  activeLayers: PropTypes.array,
  addOrbitTrack: PropTypes.func,
  layer: PropTypes.object,
  trackLayers: PropTypes.array
};

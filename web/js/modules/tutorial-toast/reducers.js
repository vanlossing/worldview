import { SHOW_FIRST, SHOW_NEXT, SHOW_PREV, HIDE_TOAST } from './constants';
import { assign as lodashAssign } from 'lodash';

const INITIAL_STATE = {
  currentToast: 0,
  showToast: false
};

export default function toastReducer(state = INITIAL_STATE, action) {
  switch (action.type) {
    case SHOW_FIRST:
      return lodashAssign({}, state, {
        currentToast: 1,
        showToast: true
      });
    case SHOW_NEXT:
      return lodashAssign({}, state, {
        currentToast: action.value || state.currentToast + 1
      });
    case SHOW_PREV:
      return lodashAssign({}, state, {
        currentToast: state.currentToast - 1
      });
    case HIDE_TOAST:
      return lodashAssign({}, state, {
        currentToast: 0,
        showToast: false
      });
    default:
      return state;
  }
}

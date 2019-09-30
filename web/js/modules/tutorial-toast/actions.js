import {
  SHOW_FIRST,
  SHOW_NEXT,
  SHOW_PREV,
  HIDE_TOAST
} from './constants';

export function showFirstToast() {
  return {
    type: SHOW_FIRST
  };
}
export function showNextToast(toastNumber) {
  return {
    type: SHOW_NEXT,
    value: toastNumber
  };
}
export function showPrevToast() {
  return {
    type: SHOW_PREV
  };
}
export function hideToast() {
  return {
    type: HIDE_TOAST
  };
}

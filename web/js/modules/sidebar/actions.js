import {
  CHANGE_TAB,
  TOGGLE_COLLAPSE,
  COLLAPSE_SIDEBAR,
  EXPAND_SIDEBAR
} from './constants';

export function changeTab(str) {
  return {
    type: CHANGE_TAB,
    activeTab: str
  };
}
export function toggleSidebarCollapse(str) {
  return {
    type: TOGGLE_COLLAPSE
  };
}

export function collapseSidebar() {
  return {
    type: COLLAPSE_SIDEBAR
  };
}

export function expandSidebar(str) {
  return {
    type: EXPAND_SIDEBAR
  };
}

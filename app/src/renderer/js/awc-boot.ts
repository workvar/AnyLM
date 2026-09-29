// Eagerly register the AWC UI (Material Design 3) components used by the
// desktop chrome. Bundled into dist/renderer/js/awc-boot.js at build time so
// the file:// renderer does not need bare package resolution.
import "@awc-ui/core/css/tokens.css";
import "@awc-ui/core/components/md-button";
import "@awc-ui/core/components/md-text-field";
import "@awc-ui/core/components/md-card";
import "@awc-ui/core/components/md-icon-button";
import "@awc-ui/core/components/md-divider";
import "@awc-ui/core/components/md-chip";
import "@awc-ui/core/components/md-list";
import "@awc-ui/core/components/md-list-item";
import "@awc-ui/core/components/md-dialog";
import "@awc-ui/core/components/md-switch";
import "@awc-ui/core/components/md-tabs";
import "@awc-ui/core/components/md-tab";
import "@awc-ui/core/components/md-snackbar";
import "@awc-ui/core/components/md-progress-indicator";
import "@awc-ui/core/components/md-avatar";
import "@awc-ui/core/components/md-fab";
import "@awc-ui/core/components/md-navigation-rail";
import "@awc-ui/core/components/md-navigation-rail-tab";
import "@awc-ui/core/components/md-app-bar";
import "@awc-ui/core/components/md-toolbar";
import "@awc-ui/core/components/md-menu";
import "@awc-ui/core/components/md-menu-item";
import "@awc-ui/core/components/md-badge";
import "@awc-ui/core/components/md-status-dot";

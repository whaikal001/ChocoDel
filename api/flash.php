<?php
/**
 * ChocoDel — pull queued flash messages out of the session.
 * Called by the shared JS once on every page load.
 */

require_once __DIR__ . '/helpers.php';

send(['flash' => take_flash()]);

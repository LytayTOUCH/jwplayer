import activeTab from 'utils/active-tab';
import { requestAnimationFrame, cancelAnimationFrame } from 'utils/request-animation-frame';
import { Browser, OS, Features } from 'environment/environment';
import Events from 'utils/backbone.events';

const document = window.document;
const views = [];
const observed = {};
const hasOrientation = 'screen' in window && 'orientation' in window.screen;
const isAndroidChrome = OS.android && Browser.chrome;

let intersectionObserver;
let responsiveRepaintRequestId = -1;

function lazyInitIntersectionObserver() {
    const IntersectionObserver = window.IntersectionObserver;
    if (!intersectionObserver) {
        // Fire the callback every time 25% of the player comes in/out of view
        intersectionObserver = new IntersectionObserver((entries) => {
            if (entries && entries.length) {
                for (let i = entries.length; i--;) {
                    const entry = entries[i];
                    for (let j = views.length; j--;) {
                        let view = views[j];
                        if (entry.target === view.getContainer()) {
                            view.model.set('intersectionRatio', entry.intersectionRatio);
                            break;
                        }
                    }
                }
            }
        }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    }
}

function scheduleResponsiveRedraw() {
    cancelAnimationFrame(responsiveRepaintRequestId);
    responsiveRepaintRequestId = requestAnimationFrame(function responsiveRepaint() {
        views.forEach(view => {
            view.updateBounds();
        });
        views.forEach(view => {
            if (view.model.get('visibility')) {
                view.updateStyles();
            }
        });
        views.forEach(view => {
            view.checkResized();
        });
    });
}

function onOrientationChange() {
    views.forEach(view => {
        if (view.model.get('visibility') >= 0.75) {
            const state = view.model.get('state');
            const orientation = window.screen.orientation.type;
            const isLandscape = orientation === 'landscape-primary' || orientation === 'landscape-secondary';

            if (!isLandscape && state === 'paused' && view.api.getFullscreen()) {
                // Set fullscreen to false when going back to portrait while paused and return early
                view.api.setFullscreen(false);
                return;
            } else if (state === 'playing') {
                view.api.setFullscreen(isLandscape);
                return;
            }
        }
    });
}

function onVisibilityChange() {
    views.forEach(view => {
        view.model.set('activeTab', activeTab());
    });
}

function addEventListener(object, name, callback) {
    object.addEventListener(name, callback);
}

function removeEventListener(object, name, callback) {
    object.removeEventListener(name, callback);
}

addEventListener(document, 'visibilitychange', onVisibilityChange);
addEventListener(document, 'webkitvisibilitychange', onVisibilityChange);
addEventListener(window, 'resize', scheduleResponsiveRedraw);
addEventListener(window, 'orientationchange', scheduleResponsiveRedraw);

if (isAndroidChrome && hasOrientation) {
    addEventListener(window.screen.orientation, 'change', onOrientationChange);
}

if (document.readyState === 'complete') {
    addUiListeners();
} else {
    document.addEventListener('DOMContentLoaded', addUiListeners, false);
}

addEventListener(window, 'beforeunload', () => {
    removeEventListener(document, 'visibilitychange', onVisibilityChange);
    removeEventListener(document, 'webkitvisibilitychange', onVisibilityChange);
    removeEventListener(window, 'resize', scheduleResponsiveRedraw);
    removeEventListener(window, 'orientationchange', scheduleResponsiveRedraw);
    removeEventListener(window.screen.orientation, 'change', onOrientationChange);
    removeUiListeners();
});

const viewsManager = {
    add: function(view) {
        views.push(view);
    },
    remove: function(view) {
        const index = views.indexOf(view);
        if (index !== -1) {
            views.splice(index, 1);
        }
    },
    size: function() {
        return views.length;
    },
    observe(container) {
        lazyInitIntersectionObserver();

        if (observed[container.id]) {
            return;
        }

        observed[container.id] = true;
        intersectionObserver.observe(container);
    },
    unobserve(container) {
        if (intersectionObserver && observed[container.id]) {
            delete observed[container.id];
            intersectionObserver.unobserve(container);
        }
    }
};

Object.assign(viewsManager, Events);

const trigger = (event) => viewsManager.trigger(event.type, event);

viewsManager.onUi = (element, name, callback) => {
    // Object.assign(element, Events);
    // element.on(name, callback);
    viewsManager.on(name, event => {
        if (event.target === element || element.contains(event.target)) {
            callback.call(element, event);
        }
    }, callback);
};

viewsManager.offUi = function(element, name, callback) {
    // Object.assign(element, Events);
    // element.off(name, callback);
    viewsManager.off(name, null, callback);
};

function addUiListeners() {
    const body = document.body;
    const listenerOptions = Features.passiveEvents ? { passive: false } : false;
    const supportsPointerEvents = ('PointerEvent' in window) && !OS.android;
    const supportsTouchEvents = ('ontouchstart' in window);
    const useMouseEvents = !supportsPointerEvents && !(supportsTouchEvents && OS.mobile);

    if (supportsPointerEvents) {
        addEventListener(body, 'pointerdown', trigger, listenerOptions);
        addEventListener(body, 'pointerup', trigger);
        addEventListener(body, 'pointerover', trigger);
        addEventListener(body, 'pointerout', trigger);
        addEventListener(body, 'pointermove', trigger);
        addEventListener(body, 'pointercancel', trigger);
    } else if (useMouseEvents) {
        addEventListener(body, 'mousedown', trigger, listenerOptions);
        addEventListener(body, 'mouseover', trigger);
        addEventListener(body, 'mouseout', trigger);
        addEventListener(document, 'mouseup', trigger);
        addEventListener(document, 'mousemove', trigger);
    }
    addEventListener(body, 'touchstart', trigger, listenerOptions);
    addEventListener(body, 'touchend', trigger);
    addEventListener(body, 'touchmove', trigger, listenerOptions);
    addEventListener(body, 'touchcancel', trigger);

    addEventListener(body, 'keydown', trigger);
    addEventListener(body, 'focus', trigger);
    addEventListener(body, 'blur', trigger);
}


function removeUiListeners() {
    const body = document.body;

    removeEventListener(body, 'pointerdown', trigger);
    removeEventListener(body, 'pointerup', trigger);
    removeEventListener(body, 'pointerover', trigger);
    removeEventListener(body, 'pointerout', trigger);
    removeEventListener(body, 'pointermove', trigger);
    removeEventListener(body, 'pointercancel', trigger);
    removeEventListener(body, 'mousedown', trigger);
    removeEventListener(body, 'mouseover', trigger);
    removeEventListener(body, 'mouseout', trigger);
    removeEventListener(document, 'mouseup', trigger);
    removeEventListener(document, 'mousemove', trigger);
    removeEventListener(body, 'touchstart', trigger);
    removeEventListener(body, 'touchend', trigger);
    removeEventListener(body, 'touchmove', trigger);
    removeEventListener(body, 'touchcancel', trigger);
    removeEventListener(body, 'keydown', trigger);
    removeEventListener(body, 'focus', trigger);
    removeEventListener(body, 'blur', trigger);
}

export default viewsManager;

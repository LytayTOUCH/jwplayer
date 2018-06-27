import { Browser, OS, Features } from 'environment/environment';
import { DRAG, DRAG_START, DRAG_END, CLICK, DOUBLE_CLICK, MOVE, OUT, TAP, DOUBLE_TAP, OVER, ENTER } from 'events/events';
import Events from 'utils/backbone.events';
import { now } from 'utils/date';
import viewsManager from 'view/utils/views-manager';

const TouchEvent = window.TouchEvent;
const PointerEvent = window.PointerEvent;
const _supportsPointerEvents = ('PointerEvent' in window) && !OS.android;
const _supportsTouchEvents = ('ontouchstart' in window);
const _useMouseEvents = !_supportsPointerEvents && !(_supportsTouchEvents && OS.mobile);
const _isOSXFirefox = Browser.firefox && OS.mac;

let unique = 0;

const UI = function (elem, options) {
    const _elem = elem;
    let _hasMoved = false;
    let _startX = 0;
    let _startY = 0;
    let _lastClickTime = 0;
    let _doubleClickDelay = 300;
    let _touchListenerTarget;
    let _pointerId;
    let longPressTimeout;
    let longPressDelay = 500;

    this.id = ++unique;
    this.elem = elem;
    console.log(`${this.id}. (${elem.className})`, options);

    options = options || {};

    const listenerOptions = Features.passiveEvents ? { passive: !options.preventScrolling } : false;

    const interactEndDelegate = (event) => interactEndHandler(event);

    // If its not mobile, add mouse listener.  Add touch listeners so touch devices that aren't Android or iOS
    // (windows phones) still get listeners just in case they want to use them.
    if (_supportsPointerEvents) {
        viewsManager.onUi(elem, 'pointerdown', interactStartHandler, listenerOptions);
        if (options.useHover) {
            viewsManager.onUi(elem, 'pointerover', overHandler);
            viewsManager.onUi(elem, 'pointerout', pointerOutHandler);
        }
        if (options.useMove) {
            viewsManager.onUi(elem, 'pointermove', moveHandler);
        }
    } else {
        if (_useMouseEvents) {
            viewsManager.onUi(elem, 'mousedown', interactStartHandler, listenerOptions);
            if (options.useHover) {
                viewsManager.onUi(elem, 'mouseover', overHandler);
                viewsManager.onUi(elem, 'mouseout', outHandler);
            }
            if (options.useMove) {
                viewsManager.onUi(elem, 'mousemove', moveHandler);
            }
        }

        // Always add this, in case we don't properly identify the device as mobile
        viewsManager.onUi(elem, 'touchstart', interactStartHandler, listenerOptions);
    }

    viewsManager.onUi(elem, 'keydown', keyHandler);

    if (options.useFocus) {
        viewsManager.onUi(elem, 'focus', overHandler);
        viewsManager.onUi(elem, 'blur', outHandler);
    }

    // overHandler and outHandler not assigned in touch situations
    function overHandler(evt) {
        if (evt.pointerType !== 'touch') {
            triggerEvent(OVER, evt);
        }
    }

    function moveHandler(evt) {
        if (evt.pointerType !== 'touch') {
            triggerEvent(MOVE, evt);
        }
    }

    function pointerOutHandler(evt) {
        if (evt.pointerType !== 'touch' && 'x' in evt) {
            // elementFromPoint to handle an issue where setPointerCapture is causing a pointerout event
            const { x, y } = evt;
            const overElement = document.elementFromPoint(x, y);
            if (!elem.contains(overElement)) {
                triggerEvent(OUT, evt);
            }
        }
    }

    function outHandler(evt) {
        triggerEvent(OUT, evt);
    }

    function keyHandler(evt) {
        if (isEnterKey(evt)) {
            triggerEvent(ENTER, evt);
        }
    }

    function setEventListener(element, eventName, callback) {
        viewsManager.offUi(element, eventName, callback);
        viewsManager.onUi(element, eventName, callback);
    }

    function interactStartHandler(evt) {
        _touchListenerTarget = evt.target;
        _startX = getCoord(evt, 'X');
        _startY = getCoord(evt, 'Y');

        if (!isRightClick(evt)) {

            if (evt.type === 'pointerdown' && evt.isPrimary) {
                if (options.preventScrolling) {
                    _pointerId = evt.pointerId;
                    elem.setPointerCapture(_pointerId);
                }
                setEventListener(elem, 'pointermove', interactDragHandler, listenerOptions);
                setEventListener(elem, 'pointercancel', interactEndHandler);

                // Listen for mouseup after mouse pointer down because pointerup doesn't fire on swf objects
                if (evt.pointerType === 'mouse' && _touchListenerTarget.nodeName === 'OBJECT') {
                    setEventListener(document, 'mouseup', interactEndDelegate);
                } else {
                    setEventListener(elem, 'pointerup', interactEndHandler);
                }
            } else if (evt.type === 'mousedown') {
                setEventListener(document, 'mousemove', interactDragHandler, listenerOptions);

                // Handle clicks in OSX Firefox over Flash 'object'
                if (_isOSXFirefox && evt.target.nodeName.toLowerCase() === 'object') {
                    setEventListener(elem, 'click', interactEndHandler);
                } else {
                    setEventListener(document, 'mouseup', interactEndDelegate);
                }
            } else if (evt.type === 'touchstart') {
                longPressTimeout = setTimeout(() => {
                    if (_touchListenerTarget) {
                        viewsManager.offUi(_touchListenerTarget, 'touchmove', interactDragHandler);
                        viewsManager.offUi(_touchListenerTarget, 'touchcancel', interactEndHandler);
                        viewsManager.offUi(_touchListenerTarget, 'touchend', interactEndHandler);
                        _touchListenerTarget = null;
                    }
                }, longPressDelay);

                setEventListener(_touchListenerTarget, 'touchmove', interactDragHandler, listenerOptions);
                setEventListener(_touchListenerTarget, 'touchcancel', interactEndHandler);
                setEventListener(_touchListenerTarget, 'touchend', interactEndHandler);
            }

            // Prevent scrolling the screen while dragging on mobile.
            if (options.preventScrolling) {
                preventDefault(evt);
            }
        }
    }

    function interactDragHandler(evt) {
        clearTimeout(longPressTimeout);

        const movementThreshold = 6;
        if (_hasMoved) {
            triggerEvent(DRAG, evt);
        } else {
            const endX = getCoord(evt, 'X');
            const endY = getCoord(evt, 'Y');
            const moveX = endX - _startX;
            const moveY = endY - _startY;
            if (moveX * moveX + moveY * moveY > movementThreshold * movementThreshold) {
                triggerEvent(DRAG_START, evt);
                _hasMoved = true;
                triggerEvent(DRAG, evt);
            }
        }

        // Prevent scrolling the screen dragging while dragging on mobile.
        if (options.preventScrolling) {
            preventDefault(evt);
        }
    }

    function interactEndHandler(evt) {
        clearTimeout(longPressTimeout);

        const isPointerEvent = (evt.type === 'pointerup' || evt.type === 'pointercancel');
        if (isPointerEvent && options.preventScrolling) {
            elem.releasePointerCapture(_pointerId);
        }
        viewsManager.offUi(elem, 'pointermove', interactDragHandler);
        viewsManager.offUi(elem, 'pointercancel', interactEndHandler);
        viewsManager.offUi(elem, 'pointerup', interactEndHandler);
        viewsManager.offUi(document, 'mousemove', interactDragHandler);
        viewsManager.offUi(document, 'mouseup', interactEndDelegate);
        if (_touchListenerTarget) {
            viewsManager.offUi(_touchListenerTarget, 'touchmove', interactDragHandler);
            viewsManager.offUi(_touchListenerTarget, 'touchcancel', interactEndHandler);
            viewsManager.offUi(_touchListenerTarget, 'touchend', interactEndHandler);
        }

        if (_hasMoved) {
            triggerEvent(DRAG_END, evt);
        } else if ((!options.directSelect || evt.target === elem) && evt.type.indexOf('cancel') === -1) {
            if (evt.type === 'mouseup' || evt.type === 'click' || isPointerEvent && evt.pointerType === 'mouse') {
                triggerEvent(CLICK, evt);
            } else {
                triggerEvent(TAP, evt);
                if (evt.type === 'touchend') {
                    // preventDefault to not dispatch the 300ms delayed click after a tap
                    preventDefault(evt);
                }
            }
        }

        _touchListenerTarget = null;
        _hasMoved = false;
    }

    const triggerEvent = (type, srcEvent) => {
        let evt;
        if (options.enableDoubleTap && (type === CLICK || type === TAP)) {
            if (now() - _lastClickTime < _doubleClickDelay) {
                const doubleType = (type === CLICK) ?
                    DOUBLE_CLICK : DOUBLE_TAP;
                evt = normalizeUIEvent(doubleType, srcEvent, _elem);
                this.trigger(doubleType, evt);
                _lastClickTime = 0;
            } else {
                _lastClickTime = now();
            }
        }
        evt = normalizeUIEvent(type, srcEvent, _elem);
        this.trigger(type, evt);
    };

    this.triggerEvent = triggerEvent;

    this.destroy = function() {
        this.off();
        viewsManager.offUi(elem, 'touchstart', interactStartHandler);
        viewsManager.offUi(elem, 'mousedown', interactStartHandler);
        viewsManager.offUi(elem, 'keydown', keyHandler);

        if (_touchListenerTarget) {
            viewsManager.offUi(_touchListenerTarget, 'touchmove', interactDragHandler);
            viewsManager.offUi(_touchListenerTarget, 'touchcancel', interactEndHandler);
            viewsManager.offUi(_touchListenerTarget, 'touchend', interactEndHandler);
            _touchListenerTarget = null;
        }

        if (_supportsPointerEvents) {
            if (options.preventScrolling) {
                elem.releasePointerCapture(_pointerId);
            }
            viewsManager.offUi(elem, 'pointerover', overHandler);
            viewsManager.offUi(elem, 'pointerdown', interactStartHandler);
            viewsManager.offUi(elem, 'pointermove', interactDragHandler);
            viewsManager.offUi(elem, 'pointermove', moveHandler);
            viewsManager.offUi(elem, 'pointercancel', interactEndHandler);
            viewsManager.offUi(elem, 'pointerout', pointerOutHandler);
            viewsManager.offUi(elem, 'pointerup', interactEndHandler);
        }

        viewsManager.offUi(elem, 'click', interactEndHandler);
        viewsManager.offUi(elem, 'mouseover', overHandler);
        viewsManager.offUi(elem, 'mousemove', moveHandler);
        viewsManager.offUi(elem, 'mouseout', outHandler);
        viewsManager.offUi(document, 'mousemove', interactDragHandler);
        viewsManager.offUi(document, 'mouseup', interactEndDelegate);

        if (options.useFocus) {
            viewsManager.offUi(elem, 'focus', overHandler);
            viewsManager.offUi(elem, 'blur', outHandler);
        }
    };

    return this;
};

Object.assign(UI.prototype, Events, {
    on(name, callback, context) {
        console.log(`${this.id}. (${this.elem.className}).on`, name);
        Events.on.call(this, name, callback, context);
        return this;
    }
});

export default UI;

// Expose what the source of the event is so that we can ensure it's handled correctly.
// This returns only 'touch' or 'mouse'. 'pen' will be treated as a mouse.
export function getPointerType(evt) {
    if ((_supportsTouchEvents && evt instanceof TouchEvent) ||
        (_supportsPointerEvents && evt instanceof PointerEvent && evt.pointerType === 'touch')) {
        return 'touch';
    }

    return 'mouse';
}

function getCoord(e, c) {
    return /touch/.test(e.type) ? (e.originalEvent || e).changedTouches[0]['page' + c] : e['page' + c];
}

function isRightClick(evt) {
    const e = evt || window.event;

    if (!(evt instanceof MouseEvent)) {
        return false;
    }

    if ('which' in e) {
        // Gecko (Firefox), WebKit (Safari/Chrome) & Opera
        return (e.which === 3);
    } else if ('button' in e) {
        // IE and Opera
        return (e.button === 2);
    }

    return false;
}

function isEnterKey(evt) {
    const e = evt || window.event;

    if ((e instanceof KeyboardEvent) && e.keyCode === 13) {
        evt.stopPropagation();
        return true;
    }

    return false;
}

function normalizeUIEvent(type, srcEvent, target) {
    let source;

    if (srcEvent instanceof MouseEvent || (!srcEvent.touches && !srcEvent.changedTouches)) {
        source = srcEvent;
    } else if (srcEvent.touches && srcEvent.touches.length) {
        source = srcEvent.touches[0];
    } else {
        source = srcEvent.changedTouches[0];
    }

    return {
        type: type,
        sourceEvent: srcEvent,
        target: srcEvent.target,
        currentTarget: target,
        pageX: source.pageX,
        pageY: source.pageY
    };
}

// Preventdefault to prevent click events
function preventDefault(evt) {
    // Because sendEvent from utils.eventdispatcher clones evt objects instead of passing them
    //  we cannot call evt.preventDefault() on them
    if (!(evt instanceof MouseEvent) && !(evt instanceof TouchEvent)) {
        return;
    }
    if (evt.preventManipulation) {
        evt.preventManipulation();
    }
    // prevent scrolling
    if (evt.preventDefault) {
        evt.preventDefault();
    }
}

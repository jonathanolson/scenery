// Copyright 2002-2014, University of Colorado Boulder


/**
 * A persistent display of a specific Node and its descendants, which is updated at discrete points in time.
 * Unlike Scenery's old Scene type, a Display is not itself a Node.
 *
 * Use display.getDOMElement or display.domElement to retrieve the Display's DOM representation.
 * Use display.updateDisplay() to trigger the visual update in the Display's DOM element.
 *
 * Internal documentation:
 *
 * Lifecycle information:
 *   Instance (create,dispose)
 *     - out of update:            Stateless stub is created synchronously when a Node's children are added where we
 *                                 have no relevant Instance.
 *     - start of update:          Creates first (root) instance if it doesn't exist (stateless stub).
 *     - synctree:                 Create descendant instances under stubs, fills in state, and marks removed subtree
 *                                 roots for disposal.
 *     - update instance disposal: Disposes root instances that were marked. This also disposes all descendant
 *                                 instances, and for every instance,
 *                                 it disposes the currently-attached drawables.
 *   Drawable (create,dispose)
 *     - synctree:                 Creates all drawables where necessary. If it replaces a self/group/shared drawable on
 *                                 the instance,
 *                                 that old drawable is marked for disposal.
 *     - update instance disposal: Any drawables attached to disposed instances are disposed themselves (see Instance
 *                                 lifecycle).
 *     - update drawable disposal: Any marked drawables that were replaced or removed from an instance (it didn't
 *                                 maintain a reference) are disposed.
 *
 *   add/remove drawables from blocks:
 *     - stitching changes pending "parents", marks for block update
 *     - backbones marked for disposal (e.g. instance is still there, just changed to not have a backbone) will mark
 *         drawables for block updates
 *     - add/remove drawables phase updates drawables that were marked
 *     - disposed backbone instances will only remove drawables if they weren't marked for removal previously (e.g. in
 *         case we are from a removed instance)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var extend = require( 'PHET_CORE/extend' );
  var Events = require( 'AXON/Events' );
  var Dimension2 = require( 'DOT/Dimension2' );
  var Vector2 = require( 'DOT/Vector2' );
  var Matrix3 = require( 'DOT/Matrix3' );

  var scenery = require( 'SCENERY/scenery' );
  var Features = require( 'SCENERY/util/Features' );
  require( 'SCENERY/display/BackboneDrawable' );
  require( 'SCENERY/display/CanvasBlock' );
  require( 'SCENERY/display/CanvasSelfDrawable' );
  var ChangeInterval = require( 'SCENERY/display/ChangeInterval' );
  require( 'SCENERY/display/DOMSelfDrawable' );
  var Drawable = require( 'SCENERY/display/Drawable' );
  var Instance = require( 'SCENERY/display/Instance' );
  require( 'SCENERY/display/InlineCanvasCacheDrawable' );
  require( 'SCENERY/display/Renderer' );
  require( 'SCENERY/display/SharedCanvasCacheDrawable' );
  require( 'SCENERY/display/SVGSelfDrawable' );
  require( 'SCENERY/input/Input' );
  require( 'SCENERY/util/Trail' );
  var PointerAreaOverlay = require( 'SCENERY/overlays/PointerAreaOverlay' );
  var PointerOverlay = require( 'SCENERY/overlays/PointerOverlay' );
  var CanvasNodeBoundsOverlay = require( 'SCENERY/overlays/CanvasNodeBoundsOverlay' );

  // flags object used for determining what the cursor should be underneath a mouse
  var isMouseFlags = { isMouse: true };

  /*
   * Constructs a Display that will show the rootNode and its subtree in a visual state. Default options provided below
   *
   * @param {Node} rootNode - Displays this node and all of its descendants
   *
   * Valid parameters in the parameter object:
   * {
   *   allowSceneOverflow: false,           // usually anything displayed outside of this $main (DOM/CSS3 transformed SVG) is hidden with CSS overflow
   *   allowCSSHacks: true,                 // applies styling that prevents mobile browser graphical issues
   *   enablePointerEvents: true,           // allows pointer events / MSPointerEvent to be used on supported platforms.
   *   width: <current main width>,         // override the main container's width
   *   height: <current main height>,       // override the main container's height
   *   allowWebGL: true                     // boolean flag that indicates whether scenery is allowed to use WebGL for rendering
   *                                        // Makes it possible to disable WebGL for ease of testing on non-WebGL platforms, see #289
   *   webglMakeLostContextSimulatingCanvas: false   // Flag to indicate whether the WebGLBlocks should wrap the context with the makeLostContextSimulatingCanvas
   *                                                 // call from the khronos webgl-debug tools (must be in the path). This is done here because it will be important
   *                                                 // to easily simulate context loss on many devices, and the canvas must be wrapped before the rendering context is
   *                                                 // retrieved
   *   webglContextLossIncremental: false   // Flag to indicate whether an incremental webgl context loss should be triggered on the first context loss
   *                                        // This is because we must test that the code handles context loss between every pair of adjacent gl calls.
   * }
   */
  scenery.Display = function Display( rootNode, options ) {

    Display.displays.push( this );

    // supertype call to axon.Events (should just initialize a few properties here, notably _eventListeners and _staticEventListeners)
    Events.call( this );

    this.options = _.extend( {
      // initial display width
      width:  ( options && options.container && options.container.clientWidth ) || 640,

      // initial display height
      height: ( options && options.container && options.container.clientHeight ) || 480,

      //OHTWO TODO: hook up allowCSSHacks
      allowCSSHacks: true,       // applies CSS styles to the root DOM element that make it amenable to interactive content
      allowSceneOverflow: false, // usually anything displayed outside of our dom element is hidden with CSS overflow
      //OHTWO TODO: hook up enablePointerEvents
      enablePointerEvents: true, // whether we should specifically listen to pointer events if we detect support
      defaultCursor: 'default',  // what cursor is used when no other cursor is specified
      backgroundColor: null,      // initial background color

      allowWebGL: true,
      webglMakeLostContextSimulatingCanvas: false,
      webglContextLossIncremental: false
    }, options );

    // The (integral, > 0) dimensions of the Display's DOM element (only updates the DOM element on updateDisplay())
    this._size = new Dimension2( this.options.width, this.options.height );
    this._currentSize = new Dimension2( -1, -1 ); // used to check against new size to see what we need to change

    this._rootNode = rootNode;
    this._rootBackbone = null; // to be filled in later
    this._domElement = ( options && options.container ) ?
                       scenery.BackboneDrawable.repurposeBackboneContainer( options.container ) :
                       scenery.BackboneDrawable.createDivBackbone();
    this._sharedCanvasInstances = {}; // map from Node ID to Instance, for fast lookup
    this._baseInstance = null; // will be filled with the root Instance

    // We have a monotonically-increasing frame ID, generally for use with a pattern where we can mark objects with this
    // to note that they are either up-to-date or need refreshing due to this particular frame (without having to clear
    // that information after use). This is incremented every frame
    this._frameId = 0; // {Number}

    this._dirtyTransformRoots = [];
    this._dirtyTransformRootsWithoutPass = [];

    this._instanceRootsToDispose = [];
    this._drawablesToDispose = [];

    // Block changes are handled by changing the "pending" block/backbone on drawables. We want to change them all after
    // the main stitch process has completed, so we can guarantee that a single drawable is removed from its previous
    // block before being added to a new one. This is taken care of in an updateDisplay pass after syncTree / stitching.
    this._drawablesToChangeBlock = []; // {[Drawable]}

    // Drawables have two implicit linked-lists, "current" and "old". syncTree modifies the "current" linked-list
    // information so it is up-to-date, but needs to use the "old" information also. We move updating the
    // "current" => "old" linked-list information until after syncTree and stitching is complete, and is taken care of
    // in an updateDisplay pass.
    this._drawablesToUpdateLinks = []; // {[Drawable]}

    // We store information on {ChangeInterval}s that records change interval information, that may contain references.
    // We don't want to leave those references dangling after we don't need them, so they are recorded and cleaned in
    // one of updateDisplay's phases.
    this._changeIntervalsToDispose = []; // {[ChangeInterval]}

    this._lastCursor = null;

    this._currentBackgroundCSS = null;
    this._backgroundColor = null;

    // used for shortcut animation frame functions
    this._requestAnimationFrameID = 0;

    // will be filled in with a scenery.Input if event handling is enabled
    this._input = null;

    // overlays currently being displayed.
    // API expected:
    //   .domElement
    //   .update()
    this._overlays = [];
    this._pointerOverlay = null;
    this._pointerAreaOverlay = null;
    this._canvasAreaBoundsOverlay = null;

    this.applyCSSHacks();

    this.setBackgroundColor( this.options.backgroundColor );

    // global reference if we have a Display (useful)
    this.scenery = scenery;

    var accessibilityLayer = createAccessibilityDiv();
    this._domElement.appendChild( accessibilityLayer );
  };
  var Display = scenery.Display;

  inherit( Object, Display, extend( {
    // returns the base DOM element that will be displayed by this Display
    getDOMElement: function() {
      return this._domElement;
    },
    get domElement() { return this.getDOMElement(); },

    // updates the display's DOM element with the current visual state of the attached root node and its descendants
    updateDisplay: function() {
      //OHTWO TODO: turn off after most debugging work is done
      if ( window.sceneryDebugPause ) {
        return;
      }

      if ( sceneryLog && scenery.isLoggingPerformance() ) {
        this.perfSyncTreeCount = 0;
        this.perfStitchCount = 0;
        this.perfIntervalCount = 0;
        this.perfDrawableBlockChangeCount = 0;
        this.perfDrawableOldIntervalCount = 0;
        this.perfDrawableNewIntervalCount = 0;
      }

      sceneryLog && sceneryLog.Display && sceneryLog.Display( 'updateDisplay frame ' + this._frameId );
      sceneryLog && sceneryLog.Display && sceneryLog.push();

      var firstRun = !!this._baseInstance;

      // check to see whether contents under pointers changed (and if so, send the enter/exit events) to
      // maintain consistent state
      if ( this._input ) {
        this._input.validatePointers();
      }

      // validate bounds for everywhere that could trigger bounds listeners. we want to flush out any changes, so that we can call validateBounds()
      // from code below without triggering side effects (we assume that we are not reentrant).
      this._rootNode.validateWatchedBounds();

      this._baseInstance = this._baseInstance || scenery.Instance.createFromPool( this, new scenery.Trail( this._rootNode ), true, false );
      this._baseInstance.baseSyncTree();
      if ( firstRun ) {
        this.markTransformRootDirty( this._baseInstance, this._baseInstance.isTransformed ); // marks the transform root as dirty (since it is)
      }

      // update our drawable's linked lists where necessary
      while ( this._drawablesToUpdateLinks.length ) {
        this._drawablesToUpdateLinks.pop().updateLinks();
      }

      // clean change-interval information from instances, so we don't leak memory/references
      while ( this._changeIntervalsToDispose.length ) {
        this._changeIntervalsToDispose.pop().dispose();
      }

      this._rootBackbone = this._rootBackbone || this._baseInstance.groupDrawable;
      assert && assert( this._rootBackbone, 'We are guaranteed a root backbone as the groupDrawable on the base instance' );
      assert && assert( this._rootBackbone === this._baseInstance.groupDrawable, 'We don\'t want the base instance\'s groupDrawable to change' );


      if ( assertSlow ) { this._rootBackbone.audit( true, false, true ); } // allow pending blocks / dirty

      sceneryLog && sceneryLog.Display && sceneryLog.Display( 'drawable block change phase' );
      sceneryLog && sceneryLog.Display && sceneryLog.push();
      while ( this._drawablesToChangeBlock.length ) {
        var changed = this._drawablesToChangeBlock.pop().updateBlock();
        if ( sceneryLog && scenery.isLoggingPerformance() && changed ) {
          this.perfDrawableBlockChangeCount++;
        }
      }
      sceneryLog && sceneryLog.Display && sceneryLog.pop();

      if ( assertSlow ) { this._rootBackbone.audit( false, false, true ); } // allow only dirty
      if ( assertSlow ) { this._baseInstance.audit( this._frameId, false ); }

      // pre-repaint phase: update relative transform information for listeners (notification) and precomputation where desired
      this.updateDirtyTransformRoots();

      if ( assertSlow ) { this._baseInstance.audit( this._frameId, true ); }

      sceneryLog && sceneryLog.Display && sceneryLog.Display( 'disposal phase' );
      sceneryLog && sceneryLog.Display && sceneryLog.push();

      // dispose all of our instances. disposing the root will cause all descendants to also be disposed.
      // will also dispose attached drawables (self/group/etc.)
      while ( this._instanceRootsToDispose.length ) {
        this._instanceRootsToDispose.pop().dispose();
      }

      // dispose all of our other drawables.
      while ( this._drawablesToDispose.length ) {
        this._drawablesToDispose.pop().dispose();
      }

      sceneryLog && sceneryLog.Display && sceneryLog.pop();

      if ( assertSlow ) { this._baseInstance.audit( this._frameId ); }

      // repaint phase
      //OHTWO TODO: can anything be updated more efficiently by tracking at the Display level? Remember, we have recursive updates so things get updated in the right order!
      sceneryLog && sceneryLog.Display && sceneryLog.Display( 'repaint phase' );
      sceneryLog && sceneryLog.Display && sceneryLog.push();
      this._rootBackbone.update();
      sceneryLog && sceneryLog.Display && sceneryLog.pop();

      if ( assertSlow ) { this._rootBackbone.audit( false, false, false ); } // allow nothing
      if ( assertSlow ) { this._baseInstance.audit( this._frameId ); }

      this.updateCursor();
      this.updateBackgroundColor();

      this.updateSize();

      if ( this._overlays.length ) {
        var zIndex = this._rootBackbone.lastZIndex;
        for ( var i = 0; i < this._overlays.length; i++ ) {
          // layer the overlays properly
          var overlay = this._overlays[ i ];
          overlay.domElement.style.zIndex = zIndex++;

          overlay.update();
        }
      }

      this._frameId++;

      if ( sceneryLog && scenery.isLoggingPerformance() ) {
        var syncTreeMessage = 'syncTree count: ' + this.perfSyncTreeCount;
        if ( this.perfSyncTreeCount > 500 ) {
          sceneryLog.PerfCritical && sceneryLog.PerfCritical( syncTreeMessage );
        }
        else if ( this.perfSyncTreeCount > 100 ) {
          sceneryLog.PerfMajor && sceneryLog.PerfMajor( syncTreeMessage );
        }
        else if ( this.perfSyncTreeCount > 20 ) {
          sceneryLog.PerfMinor && sceneryLog.PerfMinor( syncTreeMessage );
        }
        else if ( this.perfSyncTreeCount > 0 ) {
          sceneryLog.PerfVerbose && sceneryLog.PerfVerbose( syncTreeMessage );
        }

        var drawableBlockCountMessage = 'drawable block changes: ' + this.perfDrawableBlockChangeCount + ' for' +
                                        ' -' + this.perfDrawableOldIntervalCount +
                                        ' +' + this.perfDrawableNewIntervalCount;
        if ( this.perfDrawableBlockChangeCount > 200 ) {
          sceneryLog.PerfCritical && sceneryLog.PerfCritical( drawableBlockCountMessage );
        }
        else if ( this.perfDrawableBlockChangeCount > 60 ) {
          sceneryLog.PerfMajor && sceneryLog.PerfMajor( drawableBlockCountMessage );
        }
        else if ( this.perfDrawableBlockChangeCount > 10 ) {
          sceneryLog.PerfMinor && sceneryLog.PerfMinor( drawableBlockCountMessage );
        }
        else if ( this.perfDrawableBlockChangeCount > 0 ) {
          sceneryLog.PerfVerbose && sceneryLog.PerfVerbose( drawableBlockCountMessage );
        }
      }

      sceneryLog && sceneryLog.Display && sceneryLog.pop();
    },

    updateSize: function() {
      var sizeDirty = false;
      //OHTWO TODO: if we aren't clipping or setting background colors, can we get away with having a 0x0 container div and using absolutely-positioned children?
      if ( this._size.width !== this._currentSize.width ) {
        sizeDirty = true;
        this._currentSize.width = this._size.width;
        this._domElement.style.width = this._size.width + 'px';
      }
      if ( this._size.height !== this._currentSize.height ) {
        sizeDirty = true;
        this._currentSize.height = this._size.height;
        this._domElement.style.height = this._size.height + 'px';
      }
      if ( sizeDirty && !this.options.allowSceneOverflow ) {
        // to prevent overflow, we add a CSS clip
        //TODO: 0px => 0?
        this._domElement.style.clip = 'rect(0px,' + this._size.width + 'px,' + this._size.height + 'px,0px)';
      }
    },

    getRootNode: function() {
      return this._rootNode;
    },
    get rootNode() { return this.getRootNode(); },

    // The dimensions of the Display's DOM element
    getSize: function() {
      return this._size;
    },
    get size() { return this.getSize(); },

    getBounds: function() {
      return this._size.toBounds();
    },
    get bounds() { return this.getBounds(); },

    // size: dot.Dimension2. Changes the size that the Display's DOM element will be after the next updateDisplay()
    setSize: function( size ) {
      assert && assert( size instanceof Dimension2 );
      assert && assert( size.width % 1 === 0, 'Display.width should be an integer' );
      assert && assert( size.width > 0, 'Display.width should be greater than zero' );
      assert && assert( size.height % 1 === 0, 'Display.height should be an integer' );
      assert && assert( size.height > 0, 'Display.height should be greater than zero' );

      if ( !this._size.equals( size ) ) {
        this._size = size;

        this.trigger1( 'displaySize', this._size );
      }
    },

    setWidthHeight: function( width, height ) {
      // TODO: don't burn an instance here?
      this.setSize( new Dimension2( width, height ) );
    },

    // The width of the Display's DOM element
    getWidth: function() {
      return this._size.width;
    },
    get width() { return this.getWidth(); },

    // Sets the width that the Display's DOM element will be after the next updateDisplay(). Should be an integral value.
    setWidth: function( width ) {
      assert && assert( typeof width === 'number', 'Display.width should be a number' );

      if ( this.getWidth() !== width ) {
        // TODO: remove allocation here?
        this.setSize( new Dimension2( width, this.getHeight() ) );
      }
    },
    set width( value ) { this.setWidth( value ); },

    // The height of the Display's DOM element
    getHeight: function() {
      return this._size.height;
    },
    get height() { return this.getHeight(); },

    // Sets the height that the Display's DOM element will be after the next updateDisplay(). Should be an integral value.
    setHeight: function( height ) {
      assert && assert( typeof height === 'number', 'Display.height should be a number' );

      if ( this.getHeight() !== height ) {
        // TODO: remove allocation here?
        this.setSize( new Dimension2( this.getWidth(), height ) );
      }
    },
    set height( value ) { this.setHeight( value ); },

    // {String} (CSS), {Color} instance, or null (no background color).
    // Will be applied to the root DOM element on updateDisplay(), and no sooner.
    setBackgroundColor: function( color ) {
      assert && assert( color === null || typeof color === 'string' || color instanceof scenery.Color );

      this._backgroundColor = color;
    },
    set backgroundColor( value ) { this.setBackgroundColor( value ); },

    getBackgroundColor: function() {
      return this._backgroundColor;
    },
    get backgroundColor() { return this.getBackgroundColor(); },

    addOverlay: function( overlay ) {
      this._overlays.push( overlay );
      this._domElement.appendChild( overlay.domElement );
    },

    removeOverlay: function( overlay ) {
      this._domElement.removeChild( overlay.domElement );
      this._overlays.splice( _.indexOf( this._overlays, overlay ), 1 );
    },

    /*
     * Returns the bitmask union of all renderers (canvas/svg/dom/webgl) that are used for display, excluding
     * BackboneDrawables (which would be DOM).
     */
    getUsedRenderersBitmask: function() {
      function renderersUnderBackbone( backbone ) {
        var bitmask = 0;
        _.each( backbone.blocks, function( block ) {
          if ( block instanceof scenery.DOMBlock && block.domDrawable instanceof scenery.BackboneDrawable ) {
            bitmask = bitmask | renderersUnderBackbone( block.domDrawable );
          }
          else {
            bitmask = bitmask | block.renderer;
          }
        } );
        return bitmask;
      }

      // only return the renderer-specific portion (no other hints, etc)
      return renderersUnderBackbone( this._rootBackbone ) & scenery.Renderer.bitmaskRendererArea;
    },

    /*
     * Called from Instances that will need a transform update (for listeners and precomputation).
     * @param passTransform {Boolean} - Whether we should pass the first transform root when validating transforms (should be true if the instance is transformed)
     */
    markTransformRootDirty: function( instance, passTransform ) {
      passTransform ? this._dirtyTransformRoots.push( instance ) : this._dirtyTransformRootsWithoutPass.push( instance );
    },

    updateDirtyTransformRoots: function() {
      sceneryLog && sceneryLog.transformSystem && sceneryLog.transformSystem( 'updateDirtyTransformRoots' );
      sceneryLog && sceneryLog.transformSystem && sceneryLog.push();
      while ( this._dirtyTransformRoots.length ) {
        this._dirtyTransformRoots.pop().relativeTransform.updateTransformListenersAndCompute( false, false, this._frameId, true );
      }
      while ( this._dirtyTransformRootsWithoutPass.length ) {
        this._dirtyTransformRootsWithoutPass.pop().relativeTransform.updateTransformListenersAndCompute( false, false, this._frameId, false );
      }
      sceneryLog && sceneryLog.transformSystem && sceneryLog.pop();
    },

    markDrawableChangedBlock: function( drawable ) {
      assert && assert( drawable instanceof Drawable );

      sceneryLog && sceneryLog.Display && sceneryLog.Display( 'markDrawableChangedBlock: ' + drawable.toString() );
      this._drawablesToChangeBlock.push( drawable );
    },

    markInstanceRootForDisposal: function( instance ) {
      assert && assert( instance instanceof Instance, 'How would an instance not be an instance of an instance?!?!?' );

      sceneryLog && sceneryLog.Display && sceneryLog.Display( 'markInstanceRootForDisposal: ' + instance.toString() );
      this._instanceRootsToDispose.push( instance );
    },

    markDrawableForDisposal: function( drawable ) {
      assert && assert( drawable instanceof Drawable );

      sceneryLog && sceneryLog.Display && sceneryLog.Display( 'markDrawableForDisposal: ' + drawable.toString() );
      this._drawablesToDispose.push( drawable );
    },

    markDrawableForLinksUpdate: function( drawable ) {
      assert && assert( drawable instanceof Drawable );

      this._drawablesToUpdateLinks.push( drawable );
    },

    // Add a {ChangeInterval} for the "remove change interval info" phase (we don't want to leak memory/references)
    markChangeIntervalToDispose: function( changeInterval ) {
      assert && assert( changeInterval instanceof ChangeInterval );

      this._changeIntervalsToDispose.push( changeInterval );
    },

    updateBackgroundColor: function() {
      assert && assert( this._backgroundColor === null ||
                        typeof this._backgroundColor === 'string' ||
                        this._backgroundColor instanceof scenery.Color );

      var newBackgroundCSS = this._backgroundColor === null ?
                             '' :
                             ( this._backgroundColor.toCSS ?
                               this._backgroundColor.toCSS() :
                               this._backgroundColor );
      if ( newBackgroundCSS !== this._currentBackgroundCSS ) {
        this._currentBackgroundCSS = newBackgroundCSS;

        this._domElement.style.backgroundColor = newBackgroundCSS;
      }
    },

    /*---------------------------------------------------------------------------*
     * Cursors
     *----------------------------------------------------------------------------*/

    updateCursor: function() {
      if ( this._input && this._input.mouse && this._input.mouse.point ) {
        if ( this._input.mouse.cursor ) {
          sceneryLog && sceneryLog.Cursor && sceneryLog.Cursor( 'set on pointer: ' + this._input.mouse.cursor );
          return this.setSceneCursor( this._input.mouse.cursor );
        }

        //OHTWO TODO: For a display, just return an instance and we can avoid the garbage collection/mutation at the cost of the linked-list traversal instead of an array
        var mouseTrail = this._rootNode.trailUnderPoint( this._input.mouse.point, isMouseFlags );

        if ( mouseTrail ) {
          for ( var i = mouseTrail.length - 1; i >= 0; i-- ) {
            var node = mouseTrail.nodes[ i ];
            var cursor = node.getCursor();

            if ( cursor ) {
              sceneryLog && sceneryLog.Cursor && sceneryLog.Cursor( cursor + ' on ' + node.constructor.name + '#' + node.id );
              return this.setSceneCursor( cursor );
            }
          }
        }

        sceneryLog && sceneryLog.Cursor && sceneryLog.Cursor( '--- for ' + ( mouseTrail ? mouseTrail.toString() : '(no hit)' ) );
      }

      // fallback case
      return this.setSceneCursor( this.options.defaultCursor );
    },

    setSceneCursor: function( cursor ) {
      if ( cursor !== this._lastCursor ) {
        this._lastCursor = cursor;
        var customCursors = Display.customCursors[ cursor ];
        if ( customCursors ) {
          // go backwards, so the most desired cursor sticks
          for ( var i = customCursors.length - 1; i >= 0; i-- ) {
            this._domElement.style.cursor = customCursors[ i ];
          }
        }
        else {
          this._domElement.style.cursor = cursor;
        }
      }
    },

    applyCSSHacks: function() {
      // to use CSS3 transforms for performance, hide anything outside our bounds by default
      if ( !this.options.allowSceneOverflow ) {
        this._domElement.style.overflow = 'hidden';
      }

      // forward all pointer events
      this._domElement.style.msTouchAction = 'none';

      if ( this.options.allowCSSHacks ) {
        // some css hacks (inspired from https://github.com/EightMedia/hammer.js/blob/master/hammer.js).
        // modified to only apply the proper prefixed version instead of spamming all of them, and doesn't use jQuery.
        Features.setStyle( this._domElement, Features.userDrag, 'none' );
        Features.setStyle( this._domElement, Features.userSelect, 'none' );
        Features.setStyle( this._domElement, Features.touchAction, 'none' );
        Features.setStyle( this._domElement, Features.touchCallout, 'none' );
        Features.setStyle( this._domElement, Features.tapHighlightColor, 'rgba(0,0,0,0)' );
      }
    },

    // TODO: consider SVG data URLs
    canvasDataURL: function( callback ) {
      this.canvasSnapshot( function( canvas ) {
        callback( canvas.toDataURL() );
      } );
    },

    // renders what it can into a Canvas (so far, Canvas and SVG layers work fine)
    canvasSnapshot: function( callback ) {
      var canvas = document.createElement( 'canvas' );
      canvas.width = this._size.width;
      canvas.height = this._size.height;

      var context = canvas.getContext( '2d' );

      //OHTWO TODO: allow actual background color directly, not having to check the style here!!!
      this._rootNode.renderToCanvas( canvas, context, function() {
        callback( canvas, context.getImageData( 0, 0, canvas.width, canvas.height ) );
      }, this.domElement.style.backgroundColor );
    },

    //TODO: reduce code duplication for handling overlays
    setPointerDisplayVisible: function( visibility ) {
      // @deprecated, Joist code calls us with undefined first....
      if ( visibility === undefined ) {
        return;
      }

      assert && assert( typeof visibility === 'boolean' );

      var hasOverlay = !!this._pointerOverlay;

      if ( visibility !== hasOverlay ) {
        if ( !visibility ) {
          this.removeOverlay( this._pointerOverlay );
          this._pointerOverlay.dispose();
          this._pointerOverlay = null;
        }
        else {
          this._pointerOverlay = new PointerOverlay( this, this._rootNode );
          this.addOverlay( this._pointerOverlay );
        }
      }
    },

    //TODO: reduce code duplication for handling overlays
    setPointerAreaDisplayVisible: function( visibility ) {
      // @deprecated, Joist code calls us with undefined first....
      if ( visibility === undefined ) {
        return;
      }

      assert && assert( typeof visibility === 'boolean' );

      var hasOverlay = !!this._pointerAreaOverlay;

      if ( visibility !== hasOverlay ) {
        if ( !visibility ) {
          this.removeOverlay( this._pointerAreaOverlay );
          this._pointerAreaOverlay.dispose();
          this._pointerAreaOverlay = null;
        }
        else {
          this._pointerAreaOverlay = new PointerAreaOverlay( this, this._rootNode );
          this.addOverlay( this._pointerAreaOverlay );
        }
      }
    },

    //TODO: reduce code duplication for handling overlays
    setCanvasNodeBoundsVisible: function( visibility ) {
      // @deprecated, Joist code calls us with undefined first....
      if ( visibility === undefined ) {
        return;
      }

      assert && assert( typeof visibility === 'boolean' );

      var hasOverlay = !!this._canvasAreaBoundsOverlay;

      if ( visibility !== hasOverlay ) {
        if ( !visibility ) {
          this.removeOverlay( this._canvasAreaBoundsOverlay );
          this._canvasAreaBoundsOverlay.dispose();
          this._canvasAreaBoundsOverlay = null;
        }
        else {
          this._canvasAreaBoundsOverlay = new CanvasNodeBoundsOverlay( this, this._rootNode );
          this.addOverlay( this._canvasAreaBoundsOverlay );
        }
      }
    },

    resizeOnWindowResize: function() {
      var display = this;

      var resizer = function() {
        display.setWidthHeight( window.innerWidth, window.innerHeight );
      };
      window.addEventListener( 'resize', resizer );
      resizer();
    },

    // Updates on every request animation frame. If stepCallback is passed in, it is called before updateDisplay() with
    // stepCallback( timeElapsedInSeconds )
    updateOnRequestAnimationFrame: function( stepCallback ) {
      // keep track of how much time elapsed over the last frame
      var lastTime = 0;
      var timeElapsedInSeconds = 0;

      var display = this;
      (function step() {
        display._requestAnimationFrameID = window.requestAnimationFrame( step, display._domElement );

        // calculate how much time has elapsed since we rendered the last frame
        var timeNow = new Date().getTime();
        if ( lastTime !== 0 ) {
          timeElapsedInSeconds = ( timeNow - lastTime ) / 1000.0;
        }
        lastTime = timeNow;

        stepCallback && stepCallback( timeElapsedInSeconds );
        display.updateDisplay();
      })();
    },

    cancelUpdateOnRequestAnimationFrame: function() {
      window.cancelAnimationFrame( this._requestAnimationFrameID );
    },

    initializeStandaloneEvents: function( parameters ) {
      // TODO extract similarity between standalone and fullscreen!
      var element = this._domElement;
      this.initializeEvents( _.extend( {}, {
        listenerTarget: element,
        pointFromEvent: function pointFromEvent( evt ) {
          var mainBounds = element.getBoundingClientRect();
          return Vector2.createFromPool( evt.clientX - mainBounds.left, evt.clientY - mainBounds.top );
        }
      }, parameters ) );
    },

    initializeFullscreenEvents: function( parameters ) {
      var element = this._domElement;
      this.initializeEvents( _.extend( {}, {
        listenerTarget: document,
        pointFromEvent: function pointFromEvent( evt ) {
          var mainBounds = element.getBoundingClientRect();
          return Vector2.createFromPool( evt.clientX - mainBounds.left, evt.clientY - mainBounds.top );
        }
      }, parameters ) );
    },

    initializeWindowEvents: function( parameters ) {
      this.initializeEvents( _.extend( {}, {
        listenerTarget: window,
        pointFromEvent: function pointFromEvent( evt ) {
          return Vector2.createFromPool( evt.clientX, evt.clientY );
        }
      }, parameters ) );
    },

    //OHTWO TODO: ability to disconnect event handling (useful for playground debugging)
    initializeEvents: function( parameters ) {
      assert && assert( !this._input, 'Events cannot be attached twice to a display (for now)' );

      // TODO: come up with more parameter names that have the same string length, so it looks creepier
      var pointFromEvent = parameters.pointFromEvent;
      var listenerTarget = parameters.listenerTarget;
      var batchDOMEvents = parameters.batchDOMEvents; //OHTWO TODO: hybrid batching (option to batch until an event like 'up' that might be needed for security issues)

      var input = new scenery.Input( this._rootNode, listenerTarget, !!batchDOMEvents, this.options.enablePointerEvents, pointFromEvent );
      this._input = input;

      input.connectListeners();
    },

    detachEvents: function() {
      assert && assert( this._input, 'detachEvents() should be called only when events are attached' );

      this._input.disconnectListeners();
      this._input = null;
    },

    getDebugHTML: function() {
      function str( ob ) {
        return ob ? ob.toString() : ob + '';
      }

      var depth = 0;

      var result = 'Display ' + this._size.toString() + ' frame:' + this._frameId + ' input:' + !!this._input + ' cursor:' + this._lastCursor + '<br>';

      function instanceSummary( instance ) {
        var iSummary = '';

        function addQualifier( text ) {
          iSummary += ' <span style="color: #008">' + text + '</span>';
        }

        var node = instance.node;

        iSummary += instance.id;
        iSummary += ' ' + ( node.constructor.name ? node.constructor.name : '?' );
        iSummary += ' <span style="font-weight: ' + ( node.isPainted() ? 'bold' : 'normal' ) + '">' + node.id + '</span>';
        iSummary += node.getDebugHTMLExtras();

        if ( !node._visible ) {
          addQualifier( 'invisible' );
        }
        if ( node._pickable === true ) {
          addQualifier( 'pickable' );
        }
        if ( node._pickable === false ) {
          addQualifier( 'unpickable' );
        }
        if ( instance.trail.isPickable() ) {
          addQualifier( '<span style="color: #808">hits</span>' );
        }
        if ( node._clipArea ) {
          addQualifier( 'clipArea' );
        }
        if ( node._mouseArea ) {
          addQualifier( 'mouseArea' );
        }
        if ( node._touchArea ) {
          addQualifier( 'touchArea' );
        }
        if ( node._inputListeners.length ) {
          addQualifier( 'inputListeners' );
        }
        if ( node.getRenderer() ) {
          addQualifier( 'renderer:' + node.getRenderer() );
        }
        if ( node.isLayerSplit() ) {
          addQualifier( 'layerSplit' );
        }
        if ( node._opacity < 1 ) {
          addQualifier( 'opacity:' + node._opacity );
        }

        var transformType = '';
        switch( node.transform.getMatrix().type ) {
          case Matrix3.Types.IDENTITY:
            transformType = '';
            break;
          case Matrix3.Types.TRANSLATION_2D:
            transformType = 'translated';
            break;
          case Matrix3.Types.SCALING:
            transformType = 'scale';
            break;
          case Matrix3.Types.AFFINE:
            transformType = 'affine';
            break;
          case Matrix3.Types.OTHER:
            transformType = 'other';
            break;
        }
        if ( transformType ) {
          iSummary += ' <span style="color: #88f" title="' + node.transform.getMatrix().toString().replace( '\n', '&#10;' ) + '">' + transformType + '</span>';
        }

        iSummary += ' <span style="color: #888">[Trail ' + instance.trail.indices.join( '.' ) + ']</span>';
        iSummary += ' <span style="color: #c88">' + str( instance.state ) + '</span>';
        iSummary += ' <span style="color: #8c8">' + node._rendererSummary.bitmask.toString( 16 ) + ( node._rendererBitmask !== scenery.bitmaskNodeDefault ? ' (' + node._rendererBitmask.toString( 16 ) + ')' : '' ) + '</span>';

        return iSummary;
      }

      function drawableSummary( drawable ) {
        return drawable.toString() + ( drawable.dirty ? ' <span style="color: #c00;">[x]</span>' : '' );
      }

      function printInstanceSubtree( instance ) {
        var div = '<div style="margin-left: ' + ( depth * 20 ) + 'px">';

        function addDrawable( name, drawable ) {
          div += ' <span style="color: #888">' + name + ':' + drawableSummary( drawable ) + '</span>';
        }

        div += instanceSummary( instance );

        instance.selfDrawable && addDrawable( 'self', instance.selfDrawable );
        instance.groupDrawable && addDrawable( 'group', instance.groupDrawable );
        instance.sharedCacheDrawable && addDrawable( 'sharedCache', instance.sharedCacheDrawable );

        div += '</div>';
        result += div;

        depth += 1;
        _.each( instance.children, function( childInstance ) {
          printInstanceSubtree( childInstance );
        } );
        depth -= 1;
      }

      if ( this._baseInstance ) {
        result += '<div style="font-weight: bold;">Root Instance Tree</div>';
        printInstanceSubtree( this._baseInstance );
      }

      _.each( this._sharedCanvasInstances, function( instance ) {
        result += '<div style="font-weight: bold;">Shared Canvas Instance Tree</div>';
        printInstanceSubtree( instance );
      } );

      function printDrawableSubtree( drawable ) {
        var div = '<div style="margin-left: ' + ( depth * 20 ) + 'px">';

        div += drawableSummary( drawable );
        if ( drawable.instance ) {
          div += ' <span style="color: #0a0;">(' + drawable.instance.trail.toPathString() + ')</span>';
          div += '&nbsp;&nbsp;&nbsp;' + instanceSummary( drawable.instance );
        }
        else if ( drawable.backboneInstance ) {
          div += ' <span style="color: #a00;">(' + drawable.backboneInstance.trail.toPathString() + ')</span>';
          div += '&nbsp;&nbsp;&nbsp;' + instanceSummary( drawable.backboneInstance );
        }

        div += '</div>';
        result += div;

        if ( drawable.blocks ) {
          // we're a backbone
          depth += 1;
          _.each( drawable.blocks, function( childDrawable ) {
            printDrawableSubtree( childDrawable );
          } );
          depth -= 1;
        }
        else if ( drawable.firstDrawable && drawable.lastDrawable ) {
          // we're a block
          depth += 1;
          for ( var childDrawable = drawable.firstDrawable; childDrawable !== drawable.lastDrawable; childDrawable = childDrawable.nextDrawable ) {
            printDrawableSubtree( childDrawable );
          }
          printDrawableSubtree( drawable.lastDrawable ); // wasn't hit in our simplified (and safer) loop
          depth -= 1;
        }
      }

      if ( this._rootBackbone ) {
        result += '<div style="font-weight: bold;">Root Drawable Tree</div>';
        printDrawableSubtree( this._rootBackbone );
      }

      //OHTWO TODO: add shared cache drawable trees

      return result;
    },

    popupDebug: function() {
      var htmlContent = '<!DOCTYPE html>' +
                        '<html lang="en">' +
                        '<head><title>Scenery Debug Snapshot</title></head>' +
                        '<body style="font-size: 12px;">' + this.getDebugHTML() + '</body>' +
                        '</html>';
      window.open( 'data:text/html;charset=utf-8,' + encodeURIComponent( htmlContent ) );
    },

    toStringWithChildren: function( mutateRoot, rootName ) {
      rootName = rootName || 'scene';
      var rootNode = this._rootNode;
      var result = '';

      var nodes = this._rootNode.getTopologicallySortedNodes().slice( 0 ).reverse(); // defensive slice, in case we store the order somewhere

      function name( node ) {
        return node === rootNode ? rootName : ( ( node.constructor.name ? node.constructor.name.toLowerCase() : '(node)' ) + node.id );
      }

      _.each( nodes, function( node ) {
        if ( result ) {
          result += '\n';
        }

        if ( mutateRoot && node === rootNode ) {
          var props = rootNode.getPropString( '  ', false );
          var mutation = ( props ? ( '\n' + props + '\n' ) : '' );
          if ( mutation !== '' ) {
            result += rootName + '.mutate( {' + mutation + '} )';
          }
          else {
            // bleh. strip off the last newline
            result = result.slice( 0, -1 );
          }
        }
        else {
          result += 'var ' + name( node ) + ' = ' + node.toString( '', false );
        }

        _.each( node.children, function( child ) {
          result += '\n' + name( node ) + '.addChild( ' + name( child ) + ' );';
        } );
      } );

      return result;
    }

  }, Events.prototype ) );

  Display.customCursors = {
    'scenery-grab-pointer': [ 'grab', '-moz-grab', '-webkit-grab', 'pointer' ],
    'scenery-grabbing-pointer': [ 'grabbing', '-moz-grabbing', '-webkit-grabbing', 'pointer' ]
  };

  // Creates the div that will contain the accessibiity-related DOM elements.
  var createAccessibilityDiv = function() {
    var div = document.createElement( 'div' );
    div.setAttribute( 'id', 'accessibility' );
    div.style.position = 'absolute';
    div.style.left = '0';
    div.style.top = '0';
    div.style.width = '0';
    div.style.height = '0';

    // Create some fake children for now so that tabbing doesn't take you out of the HTML content.
    // TODO: this should eventually be replaced by actual peers, or at least the appropriate count of children (to match
    // TODO: the number of focusable nodes)
    for ( var i = 0; i < 100; i++ ) {
      var child = document.createElement( 'div' );
      child.setAttribute( 'tabindex', 0 );
      div.appendChild( child );
    }

    return div;
  };

  // Static list of all known displays that have been instantiated.
  // TODO: support for deletion of Displays.
  Display.displays = [];

  return Display;
} );

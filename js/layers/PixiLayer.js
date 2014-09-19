// Copyright 2002-2013, University of Colorado

/**
 * A pixi.js based layer in the scene graph, which uses pixi.js to render.  Based on the scenery PixiLayer.js
 * implementation because the scene graphs are structured similarly.
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 * @author Sam Reid
 */

define( function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Transform3 = require( 'DOT/Transform3' );
  var Matrix3 = require( 'DOT/Matrix3' );

  var scenery = require( 'SCENERY/scenery' );

  var Layer = require( 'SCENERY/layers/Layer' ); // extends Layer
  require( 'SCENERY/util/Trail' );
  require( 'SCENERY/util/Util' );

  scenery.PixiLayer = function PixiLayer( args ) {
    Layer.call( this, args );
    this.width = this.scene.sceneBounds.width;
    this.height = this.scene.sceneBounds.height;
    this.scene = args.scene;
    sceneryLayerLog && sceneryLayerLog( 'PixiLayer #' + this.id + ' constructor' );

    // create an new instance of a pixi stage
    this.pixiStage = new PIXI.Stage( 0xFF0000 );
    this.pixiRenderer = PIXI.autoDetectRenderer( this.width, this.height, null, true ); // true -> transparent

    this.pixiRoot = new PIXI.DisplayObjectContainer();
    this.pixiStage.addChild( this.pixiRoot );

    var domElement = this.pixiRenderer.view;
    this.domElement = domElement;
    domElement.style.width = this.width + 'px';
    domElement.style.height = this.height + 'px';
    domElement.style.position = 'absolute';
    domElement.style.left = '0';
    domElement.style.top = '0';

    // add the renderer view element to the DOM
    this.$main.append( domElement );

    this.isPixiLayer = true;

    this.displayObjectContainerMap = {};

    this.nodes = [];
  };
  var PixiLayer = scenery.PixiLayer;

  // used as an object pool for marking internal base node bounds

  var scratchBounds1 = Bounds2.NOTHING.copy();

  inherit( Layer, PixiLayer, {

    addInstance: function( instance ) {
      var node = instance.node.createPixiDisplayObject();
      this.nodes.push( node );
      this.pixiStage.addChild( node );
    },

    removeInstance: function( instance ) {

    },

    render: function( scene, args ) {

      for ( var i = 0; i < this.nodes.length; i++ ) {
        var o = this.nodes[i];
        if ( window.skaterData ) {
          var skaterNode = window.skaterData.skaterNode;

          var m = skaterNode.getLocalToGlobalMatrix();

          o.position.x = m.getTranslation().x;
          o.position.y = m.getTranslation().y;
          o.rotation = window.skaterData.angle;
          o.scale.set( m.getScaleVector().x );
        }
      }

      // render the stage
      this.pixiRenderer.render( this.pixiStage );
    },

    dispose: function() {
      Layer.prototype.dispose.call( this );

      this.domElement.parentNode.removeChild( this.domElement );

      this.pixiRenderer.destroy && this.pixiRenderer.destroy();
    },

    // TODO: consider a stack-based model for transforms?
    applyTransformationMatrix: function( matrix ) {

    },

    // returns next zIndex in place. allows layers to take up more than one single zIndex
    reindex: function( zIndex ) {
      Layer.prototype.reindex.call( this, zIndex );

      if ( this.zIndex !== zIndex ) {
        this.domElement.style.zIndex = zIndex;
        this.zIndex = zIndex;
      }
      return zIndex + 1;
    },

    pushClipShape: function( shape ) {

    },

    popClipShape: function() {

    },

    getSVGString: function() {
      // TODO: might fail with WebGL:
      return '<image xmlns:xlink="' + scenery.xlinkns + '" xlink:href="' + this.domElement.toDataURL() + '" x="0" y="0" height="' + this.domElement.height + 'px" width="' + this.domElement.width + 'px"/>';
    },

    // TODO: note for DOM we can do https://developer.mozilla.org/en-US/docs/HTML/Canvas/Drawing_DOM_objects_into_a_canvas
    renderToCanvas: function( canvas, context, delayCounts ) {
      context.drawImage( this.domElement, 0, 0 );
    },

    getName: function() {
      return 'pixi';
    },

    /*---------------------------------------------------------------------------*
     * Events from Instances
     *----------------------------------------------------------------------------*/

    notifyVisibilityChange: function( instance ) {
      sceneryLayerLog && sceneryLayerLog( 'PixiLayer #' + this.id + ' notifyVisibilityChange: ' + instance.trail.toString() );
    },

    notifyOpacityChange: function( instance ) {
      sceneryLayerLog && sceneryLayerLog( 'PixiLayer #' + this.id + ' notifyOpacityChange: ' + instance.trail.toString() );
    },

    notifyClipChange: function( instance ) {
      sceneryLayerLog && sceneryLayerLog( 'PixiLayer #' + this.id + ' notifyClipChange: ' + instance.trail.toString() );
    },

    // only a painted trail under this layer
    notifyBeforeSelfChange: function( instance ) {
      sceneryLayerLog && sceneryLayerLog( 'PixiLayer #' + this.id + ' notifyBeforeSelfChange: ' + instance.trail.toString() );
    },

    notifyBeforeSubtreeChange: function( instance ) {
      sceneryLayerLog && sceneryLayerLog( 'PixiLayer #' + this.id + ' notifyBeforeSubtreeChange: ' + instance.trail.toString() );
    },

    // only a painted trail under this layer
    notifyDirtySelfPaint: function( instance ) {
      sceneryLayerLog && sceneryLayerLog( 'PixiLayer #' + this.id + ' notifyDirtySelfPaint: ' + instance.trail.toString() );
    },

    notifyDirtySubtreePaint: function( instance ) {
      sceneryLayerLog && sceneryLayerLog( 'PixiLayer #' + this.id + ' notifyDirtySubtreePaint: ' + instance.trail.toString() );
    },

    notifyTransformChange: function( instance ) {
      sceneryLayerLog && sceneryLayerLog( 'PixiLayer #' + this.id + ' notifyTransformChange: ' + instance.trail.toString() );
    },

    // only a painted trail under this layer (for now)
    notifyBoundsAccuracyChange: function( instance ) {
      sceneryLayerLog && sceneryLayerLog( 'PixiLayer #' + this.id + ' notifyBoundsAccuracyChange: ' + instance.trail.toString() );
    }

  } );

  return PixiLayer;
} );

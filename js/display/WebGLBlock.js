// Copyright 2002-2014, University of Colorado Boulder

/**
 * Handles a visual WebGL layer of drawables.  The WebGL system is designed to be modular, so that testing can
 * easily be done without scenery.  Hence WebGLBlock delegates most of its work to WebGLRenderer.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Sharfudeen Ashraf (For Ghent University)
 */
define( function( require ) {
  'use strict';

  // modules
  var inherit = require( 'PHET_CORE/inherit' );
  var PoolableMixin = require( 'PHET_CORE/PoolableMixin' );
  var cleanArray = require( 'PHET_CORE/cleanArray' );
  var scenery = require( 'SCENERY/scenery' );
  var FittedBlock = require( 'SCENERY/display/FittedBlock' );
  var Util = require( 'SCENERY/util/Util' );
  var WebGLRenderer = require( 'SCENERY/display/webgl/WebGLRenderer' );

  scenery.WebGLBlock = function WebGLBlock( display, renderer, transformRootInstance, filterRootInstance ) {
    this.initialize( display, renderer, transformRootInstance, filterRootInstance );
  };
  var WebGLBlock = scenery.WebGLBlock;

  inherit( FittedBlock, WebGLBlock, {
    initialize: function( display, renderer, transformRootInstance, filterRootInstance ) {

      this.initializeFittedBlock( display, renderer, transformRootInstance );

      // WebGLBlocks are hard-coded to take the full display size (as opposed to svg and canvas)
      // Since we saw some jitter on iPad, see #318 and generally expect WebGL layers to span the entire display
      // In the future, it would be good to understand what was causing the problem and make webgl consistent
      // with svg and canvas again.
      this.fit = FittedBlock.FULL_DISPLAY;

      this.filterRootInstance = filterRootInstance;

      this.dirtyDrawables = cleanArray( this.dirtyDrawables );

      // TODO: Maybe reuse the WebGLRenderer and use an initialize pattern()?

      // TODO: Maybe pass through Renderer.bitmaskWebGLLowResolution ) ?
      // Each WebGL block needs its own canvas, and this is created by the WebGLRenderer.
      this.webglRenderer = new WebGLRenderer( { stats: false } );
      this.domElement = this.webglRenderer.canvas;

      // reset any fit transforms that were applied
      // TODO: What is force acceleration?
      Util.prepareForTransform( this.webglRenderer.canvas, this.forceAcceleration );
      Util.unsetTransform( this.webglRenderer.canvas ); // clear out any transforms that could have been previously applied

      // store our backing scale so we don't have to look it up while fitting
//      this.backingScale = ( renderer & Renderer.bitmaskWebGLLowResolution ) ? 1 : scenery.Util.backingScale( this.gl );

      this.initializeWebGLState();

      sceneryLog && sceneryLog.WebGLBlock && sceneryLog.WebGLBlock( 'initialized #' + this.id );
      // TODO: dirty list of nodes (each should go dirty only once, easier than scanning all?)

      return this;
    },

    initializeWebGLState: function() {

      // TODO: Maybe initialize the webglRenderer, if it is reused during pooling?
//      this.webglRenderer.initialize();
    },

    setSizeFullDisplay: function() {

      // TODO: Allow scenery to change the size of the WebGLRenderer.canvas
      var size = this.display.getSize();
      this.webglRenderer.setCanvasSize( size.width, size.height );
    },

    setSizeFitBounds: function() {
      // TODO: Allow scenery to change the size of the WebGLRenderer.canvas

      var x = this.fitBounds.minX;
      var y = this.fitBounds.minY;
      //OHTWO TODO PERFORMANCE: see if we can get a speedup by putting the backing scale in our transform instead of with CSS?
      Util.setTransform( 'matrix(1,0,0,1,' + x + ',' + y + ')', this.canvas, this.forceAcceleration ); // reapply the translation as a CSS transform
      this.webglRenderer.setCanvasSize( this.fitBounds.width, this.fitBounds.height );

      //TODO: How to handle this in WebGLRenderer?
//      this.updateWebGLDimension( -x, -y, this.fitBounds.width, this.fitBounds.height );
    },

    update: function() {
      sceneryLog && sceneryLog.WebGLBlock && sceneryLog.WebGLBlock( 'update #' + this.id );
      sceneryLog && sceneryLog.WebGLBlock && sceneryLog.push();

      if ( this.dirty && !this.disposed ) {
        this.dirty = false;

        while ( this.dirtyDrawables.length ) {
          this.dirtyDrawables.pop().update();
        }

        // udpate the fit BEFORE drawing, since it may change our offset
        this.updateFit();

        this.webglRenderer.draw();
      }

      sceneryLog && sceneryLog.WebGLBlock && sceneryLog.pop();
    },

    dispose: function() {
      sceneryLog && sceneryLog.WebGLBlock && sceneryLog.WebGLBlock( 'dispose #' + this.id );

      this.webglRenderer.dispose();

      // clear references
      cleanArray( this.dirtyDrawables );

      FittedBlock.prototype.dispose.call( this );
    },

    markDirtyDrawable: function( drawable ) {
      sceneryLog && sceneryLog.dirty && sceneryLog.dirty( 'markDirtyDrawable on WebGLBlock#' + this.id + ' with ' + drawable.toString() );

      assert && assert( drawable );

      // TODO: instance check to see if it is a canvas cache (usually we don't need to call update on our drawables)
      this.dirtyDrawables.push( drawable );
      this.markDirty();
    },

    addDrawable: function( drawable ) {
      sceneryLog && sceneryLog.WebGLBlock && sceneryLog.WebGLBlock( '#' + this.id + '.addDrawable ' + drawable.toString() );

      FittedBlock.prototype.addDrawable.call( this, drawable );

      drawable.initializeContext( this );

      //TODO: Don't call this every frame!  Consider preallocating a large array in the various buffers.
      this.webglRenderer.colorTriangleRenderer.bindVertexBuffer();
    },

    removeDrawable: function( drawable ) {
      sceneryLog && sceneryLog.WebGLBlock && sceneryLog.WebGLBlock( '#' + this.id + '.removeDrawable ' + drawable.toString() );

      FittedBlock.prototype.removeDrawable.call( this, drawable );
    },

    onIntervalChange: function( firstDrawable, lastDrawable ) {
      sceneryLog && sceneryLog.WebGLBlock && sceneryLog.WebGLBlock( '#' + this.id + '.onIntervalChange ' + firstDrawable.toString() + ' to ' + lastDrawable.toString() );

      FittedBlock.prototype.onIntervalChange.call( this, firstDrawable, lastDrawable );
    },

    onPotentiallyMovedDrawable: function( drawable ) {
      sceneryLog && sceneryLog.WebGLBlock && sceneryLog.WebGLBlock( '#' + this.id + '.onPotentiallyMovedDrawable ' + drawable.toString() );
      sceneryLog && sceneryLog.WebGLBlock && sceneryLog.push();

      assert && assert( drawable.parentDrawable === this );

      // For now, mark it as dirty so that we redraw anything containing it. In the future, we could have more advanced
      // behavior that figures out the intersection-region for what was moved and what it was moved past, but that's
      // a harder problem.
      drawable.markDirty();

      sceneryLog && sceneryLog.WebGLBlock && sceneryLog.pop();
    },

    // This method can be called to simulate context loss using the khronos webgl-debug context loss simulator, see #279
    simulateWebGLContextLoss: function() {
      console.log( 'simulating webgl context loss in WebGLBlock' );
      assert && assert( this.scene.webglMakeLostContextSimulatingCanvas );
      this.canvas.loseContextInNCalls( 5 );
    },

    toString: function() {
      return 'WebGLBlock#' + this.id + '-' + FittedBlock.fitString[ this.fit ];
    }
  }, {
    // Statics
    fragmentTypeFill: 0,
    fragmentTypeTexture: 1
  } );

  /* jshint -W064 */
  PoolableMixin( WebGLBlock, {
    constructorDuplicateFactory: function( pool ) {
      return function( display, renderer, transformRootInstance, filterRootInstance ) {
        if ( pool.length ) {
          sceneryLog && sceneryLog.WebGLBlock && sceneryLog.WebGLBlock( 'new from pool' );
          return pool.pop().initialize( display, renderer, transformRootInstance, filterRootInstance );
        }
        else {
          sceneryLog && sceneryLog.WebGLBlock && sceneryLog.WebGLBlock( 'new from constructor' );
          return new WebGLBlock( display, renderer, transformRootInstance, filterRootInstance );
        }
      };
    }
  } );

  return WebGLBlock;
} );

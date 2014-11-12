// Copyright 2002-2014, University of Colorado Boulder

/**
 * A node that can be custom-drawn with WebGL calls.  Similar to CanvasNode, but for WebGL.  Note that WebGL is not
 * available on every PhET-supported device, so only use this if necessary and if another workaround is in place
 * for non-WebGL platforms.  The alternative to this approach is to use standard scenery nodes with the WebGL renderer
 * specified.
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 * @author Sam Reid
 */

define( function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var scenery = require( 'SCENERY/scenery' );
  var WebGLNodeDrawable = require( 'SCENERY/nodes/drawables/WebGLNodeDrawable' );

  var Node = require( 'SCENERY/nodes/Node' );
  require( 'SCENERY/layers/Renderer' );

  // pass a canvasBounds option if you want to specify the self bounds
  scenery.WebGLNode = function WebGLNode( options ) {
    Node.call( this, options );
    this.setRendererBitmask( scenery.bitmaskSupportsWebGL );

    if ( options && options.canvasBounds ) {
      this.setCanvasBounds( options.canvasBounds );
    }
  };
  var WebGLNode = scenery.WebGLNode;

  return inherit( Node, WebGLNode, {

    // how to set the bounds of the WebGLNode
    setCanvasBounds: function( selfBounds ) {
      this.invalidateSelf( selfBounds );
    },
    set canvasBounds( value ) { this.setCanvasBounds( value ); },
    get canvasBounds() { return this.getSelfBounds(); },

    isPainted: function() {
      return true;
    },

    // override paintCanvas with a faster version, since fillRect and drawRect don't affect the current default path
    paintCanvas: function( wrapper ) {
      throw new Error( 'WebGLNode needs paintCanvas implemented' );
    },

    // override for computation of whether a point is inside the self content
    // point is considered to be in the local coordinate frame
    containsPointSelf: function( point ) {
      return false;
      // throw new Error( 'WebGLNode needs containsPointSelf implemented' );
    },

    // whether this node's self intersects the specified bounds, in the local coordinate frame
    // intersectsBoundsSelf: function( bounds ) {
    //   // TODO: implement?
    // },

    getBasicConstructor: function( propLines ) {
      return 'new scenery.WebGLNode( {' + propLines + '} )'; // TODO: no real way to do this nicely?
    },

    _mutatorKeys: [ 'canvasBounds' ].concat( Node.prototype._mutatorKeys ),

    //TODO: Perhaps a WebGLNode should be its own Drawable?
    createWebGLDrawable: function( gl ) {
      return new WebGLNodeDrawable( gl, this );
    },

    updateWebGLDrawable: function( drawable ) {
      drawable.update();
    }
  } );
} );
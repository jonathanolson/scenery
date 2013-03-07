// Copyright 2002-2012, University of Colorado

/**
 * A linear gradient that can be passed into the 'fill' or 'stroke' parameters.
 *
 * SVG gradients, see http://www.w3.org/TR/SVG/pservers.html
 *
 * TODO: reduce code sharing between gradients
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  "use strict";
  
  var assert = require( 'ASSERT/assert' )( 'scenery' );
  
  var scenery = require( 'SCENERY/scenery' );
  
  var Vector2 = require( 'DOT/Vector2' );
  
  // TODO: support scene or other various content (SVG is flexible, can backport to canvas)
  // TODO: investigate options to support repeat-x, repeat-y or no-repeat in SVG (available repeat options from Canvas)
  scenery.Pattern = function( image ) {
    this.image = image;
    
    // TODO: make a global spot that will have a 'useless' context for these purposes?
    this.canvasPattern = document.createElement( 'canvas' ).getContext( '2d' ).createPattern( image, 'repeat' );
    
    this.transformMatrix = null;
  };
  var Pattern = scenery.Pattern;
  
  Pattern.prototype = {
    constructor: Pattern,
    
    setTransformMatrix: function( transformMatrix ) {
      this.transformMatrix = transformMatrix;
    },
    
    getCanvasStyle: function() {
      return this.canvasPattern;
    },
    
    getSVGDefinition: function( id ) {
      var svgns = 'http://www.w3.org/2000/svg'; // TODO: store this in a common place!
      var definition = document.createElementNS( svgns, 'pattern' );
      definition.setAttribute( 'id', id );
      definition.setAttribute( 'patternUnits', 'userSpaceOnUse' ); // so we don't depend on the bounds of the object being drawn with the gradient
      definition.setAttribute( 'patternContentUnits', 'userSpaceOnUse' ); // TODO: is this needed?
      definition.setAttribute( 'x', 0 );
      definition.setAttribute( 'y', 0 );
      definition.setAttribute( 'width', this.image.width );
      definition.setAttribute( 'height', this.image.height );
      if ( this.transformMatrix ) {
        definition.setAttribute( 'patternTransform', this.transformMatrix.svgTransform() );
      }
      
      definition.appendChild( scenery.Image.createSVGImage( this.image.src, this.image.width, this.image.height ) );
      
      return definition;
    }
  };
  
  return Pattern;
} );
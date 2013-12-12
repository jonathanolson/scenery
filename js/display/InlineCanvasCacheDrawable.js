// Copyright 2002-2013, University of Colorado

/**
 * TODO docs
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  'use strict';
  
  var inherit = require( 'PHET_CORE/inherit' );
  var scenery = require( 'SCENERY/scenery' );
  var Drawable = require( 'SCENERY/display/Drawable' );
  
  scenery.InlineCanvasCacheDrawable = function InlineCanvasCacheDrawable( trail, renderer, instance ) {
    Drawable.call( this, trail, renderer );
    
    // TODO: NOTE: may have to separate into separate drawables for separate group renderers
    
    this.instance = instance;
  };
  var InlineCanvasCacheDrawable = scenery.InlineCanvasCacheDrawable;
  
  inherit( Drawable, InlineCanvasCacheDrawable, {
    // TODO: support Canvas/SVG/DOM
  } );
  
  return InlineCanvasCacheDrawable;
} );
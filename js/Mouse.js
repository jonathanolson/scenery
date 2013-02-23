// Copyright 2002-2012, University of Colorado

/**
 * Tracks the mouse state
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  
  var Finger = require( 'SCENERY/Finger' );
  
  var Mouse = function() {
    Finger.call( this );
    
    this.point = null;
    
    this.leftDown = false;
    this.middleDown = false;
    this.rightDown = false;
    
    this.isMouse = true;
    
    this.trail = null;
  };
  
  Mouse.prototype = _.extend( {}, Finger.prototype, {
    constructor: Mouse,
    
    down: function( point, event ) {
      this.point = point;
      switch( event.button ) {
        case 0: this.leftDown = true; break;
        case 1: this.middleDown = true; break;
        case 2: this.rightDown = true; break;
      }
    },
    
    up: function( point, event ) {
      this.point = point;
      switch( event.button ) {
        case 0: this.leftDown = false; break;
        case 1: this.middleDown = false; break;
        case 2: this.rightDown = false; break;
      }
    },
    
    move: function( point, event ) {
      this.point = point;
    },
    
    over: function( point, event ) {
      this.point = point;
    },
    
    out: function( point, event ) {
      // TODO: how to handle the mouse out-of-bounds
      this.point = null;
    }
  } );
  
  return Mouse;
} );
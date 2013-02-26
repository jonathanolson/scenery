// Copyright 2002-2012, University of Colorado

/**
 * Tracks a single key-press
 *
 * TODO: general key-press implementation
 * TODO: consider separate handling for keys in general.
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  
  var scenery = require( 'SCENERY/scenery' );
  
  var Finger = require( 'SCENERY/input/Finger' ); // Inherits from Finger
  
  scenery.Key = function( key, event ) {
    Finger.call( this );
    
    this.key = key;
    this.isKey = true;
    this.trail = null;
    this.type = 'key';
  };
  var Key = scenery.Key;
  
  Key.prototype = _.extend( {}, Finger.prototype, {
    constructor: Key
  } );
  
  return Key;
} );

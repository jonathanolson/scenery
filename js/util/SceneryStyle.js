// Copyright 2002-2013, University of Colorado

/**
 * Creates and references a stylesheet that can be built up while Scenery is loading.
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  'use strict';
  
  var scenery = require( 'SCENERY/scenery' );
  
  var styleElement = document.createElement( 'style' );
  styleElement.type = 'text/css';
  document.head.appendChild( styleElement );
  
  var stylesheet = document.styleSheets[document.styleSheets.length-1];
  sceneryAssert && sceneryAssert( stylesheet.disabled === false );
  sceneryAssert && sceneryAssert( stylesheet.cssRules.length === 0 );
  
  return {
    stylesheet: stylesheet,
    styleElement: styleElement,
    
    addRule: function( ruleString ) {
      // using a this reference so it doesn't need to be a closure
      this.stylesheet.insertRule( ruleString, 0 );
    }
  };
} );

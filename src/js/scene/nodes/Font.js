// Copyright 2002-2012, University of Colorado

/**
 * Font handling for text drawing
 *
 * Examples:
 * new scenery.Font().font                      // "10px sans-serif" (the default)
 * new scenery.Font( { family: 'serif' } ).font // "10px serif"
 * new scenery.Font( { weight: 'bold' } ).font  // "bold 10px sans-serif"
 * new scenery.Font( { size: 16 } ).font        // "16px sans-serif"
 * var font = new scenery.Font( {
 *   family: '"Times New Roman", serif'
 * } );
 * font.style = 'italic';
 * font.lineHeight = 10;
 * font.font;                                   // "italic 10px/10 'Times New Roman', serif"
 * font.family;                                 // "'Times New Roman', serif"
 * font.weight;                                 // 400 (the default)
 *
 * Useful specs:
 * http://www.w3.org/TR/css3-fonts/
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

var scenery = scenery || {};

(function(){
  "use strict";
  
  scenery.Font = function( params ) {
    // internal string representation
    this._font = '10px sans-serif';
    
    // span for using the browser to compute font styles
    this.$span = $( document.createElement( 'span' ) );
    
    var type = typeof params;
    if ( type === 'string' ) {
      this._font = params;
    } else if ( type === 'object' ) {
      this.mutate( params );
    }
  };
  var Font = scenery.Font;
  
  Font.prototype = {
    constructor: Font,
    
    getProperty: function( property ) {
      // sanity check, in case some CSS changed somewhere
      this.$span.css( 'font', this._font );
      
      return this.$span.css( property );
    },
    setProperty: function( property, value ) {
      // sanity check, in case some CSS changed somewhere
      this.$span.css( 'font', this._font );
      
      this.$span.css( property, value );
      this._font = this.$span.css( 'font' );
      
      return this;
    },
    
    // direct access to the font string
    getFont: function() { return this._font; },
    setFont: function( value ) { this._font = value; return this; },
    
    // using the property mechanism
    getFamily: function() { return this.getProperty( 'font-family' ); },
    setFamily: function( value ) { return this.setProperty( 'font-family', value ); },
    
    getWeight: function() { return this.getProperty( 'font-weight' ); },
    setWeight: function( value ) { return this.setProperty( 'font-weight', value ); },
    
    getStretch: function() { return this.getProperty( 'font-stretch' ); },
    setStretch: function( value ) { return this.setProperty( 'font-stretch', value ); },
    
    getStyle: function() { return this.getProperty( 'font-style' ); },
    setStyle: function( value ) { return this.setProperty( 'font-style', value ); },
    
    getSize: function() { return this.getProperty( 'font-size' ); },
    setSize: function( value ) { return this.setProperty( 'font-size', value ); },
    
    getLineHeight: function() { return this.getProperty( 'line-height' ); },
    setLineHeight: function( value ) { return this.setProperty( 'line-height', value ); },
    
    set font( value ) { this.setFont( value ); },
    get font() { return this.getFont(); },
    
    set weight( value ) { this.setWeight( value ); },
    get weight() { return this.getWeight(); },
    
    set family( value ) { this.setFamily( value ); },
    get family() { return this.getFamily(); },
    
    set stretch( value ) { this.setStretch( value ); },
    get stretch() { return this.getStretch(); },
    
    set style( value ) { this.setStyle( value ); },
    get style() { return this.getStyle(); },
    
    set size( value ) { this.setSize( value ); },
    get size() { return this.getSize(); },
    
    set lineHeight( value ) { this.setLineHeight( value ); },
    get lineHeight() { return this.getLineHeight(); },
    
    mutate: function( params ) {
      var font = this;
      
      _.each( this._mutatorKeys, function( key ) {
        if ( params[key] !== undefined ) {
          font[key] = params[key];
        }
      } );
    }
  };
  
  Font.prototype._mutatorKeys = [ 'font', 'weight', 'family', 'stretch', 'style', 'size', 'lineHeight' ];
})();



// Copyright 2002-2012, University of Colorado

/**
 * Text
 *
 * TODO: newlines
 *
 * Useful specs:
 * http://www.w3.org/TR/css3-text/
 * http://www.w3.org/TR/css3-fonts/
 * http://www.w3.org/TR/SVG/text.html
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  "use strict";
  
  var assert = require( 'ASSERT/assert' )( 'scenery' );
  
  var Bounds2 = require( 'DOT/Bounds2' );
  
  var scenery = require( 'SCENERY/scenery' );
  
  var Node = require( 'SCENERY/Node' ); // inherits from Node
  var Backend = require( 'SCENERY/layers/Backend' );
  var fillable = require( 'SCENERY/nodes/Fillable' );
  var objectCreate = require( 'SCENERY/util/Util' ).objectCreate; // i.e. Object.create
  require( 'SCENERY/util/Font' );
  require( 'SCENERY/util/Util' ); // for canvasAccurateBounds
  
  scenery.Text = function( text, options ) {
    this._text         = '';                 // filled in with mutator
    this._font         = new scenery.Font(); // default font, usually 10px sans-serif
    this._textAlign    = 'start';            // start, end, left, right, center
    this._textBaseline = 'alphabetic';       // top, hanging, middle, alphabetic, ideographic, bottom
    this._direction    = 'ltr';              // ltr, rtl, inherit -- consider inherit deprecated, due to how we compute text bounds in an off-screen canvas
    
    // ensure we have a parameter object
    options = options || {};
    
    // default to black filled text
    if ( options.fill === undefined ) {
      options.fill = '#000000';
    }
    
    if ( text !== undefined ) {
      // set the text parameter so that setText( text ) is effectively called in the mutator from the super call
      options.text = text;
    }
    Node.call( this, options );
  };
  var Text = scenery.Text;
  
  Text.prototype = objectCreate( Node.prototype );
  Text.prototype.constructor = Text;
  
  Text.prototype.setText = function( text ) {
    this._text = text;
    this.invalidateText();
    return this;
  };
  
  Text.prototype.getText = function() {
    return this._text;
  };
  
  Text.prototype.invalidateText = function() {
    // TODO: faster bounds determination? getBBox()?
    // investigate http://mudcu.be/journal/2011/01/html5-typographic-metrics/
    this.invalidateSelf( this.accurateCanvasBounds() );
  };

  // TODO: add SVG / DOM support
  Text.prototype.paintCanvas = function( state ) {
    var layer = state.layer;
    var context = layer.context;
    if ( this.hasFill() ) {
      layer.setFillStyle( this.getFill() );
      layer.setFont( this._font.getFont() );
      layer.setTextAlign( this._textAlign );
      layer.setTextBaseline( this._textBaseline );
      layer.setDirection( this._direction );

      context.fillText( this._text, 0, 0 );
    }
  };
  
  Text.prototype.paintWebGL = function( state ) {
    throw new Error( 'Text.prototype.paintWebGL unimplemented' );
  };
  
  Text.prototype.createSVGFragment = function() {
    var element = document.createElementNS( 'http://www.w3.org/2000/svg', 'text' );
    this.updateSVGFragment( element );
    return element;
  };
  
  Text.prototype.updateSVGFragment = function( element ) {
    var isRTL = this._direction === 'rtl';
    
    // make the text the only child
    while ( element.hasChildNodes() ) {
      element.removeChild( element.lastChild );
    }
    element.appendChild( document.createTextNode( this._text ) );
    
    element.setAttribute( 'fill', this._fill );
    
    switch ( this._textAlign ) {
      case 'start':
      case 'end':
        element.setAttribute( 'text-anchor', this._textAlign ); break;
      case 'left':
        element.setAttribute( 'text-anchor', isRTL ? 'end' : 'start' ); break;
      case 'right':
        element.setAttribute( 'text-anchor', !isRTL ? 'end' : 'start' ); break;
      case 'center':
        element.setAttribute( 'text-anchor', 'middle' ); break;
    }
    switch ( this._textBaseline ) {
      case 'alphabetic':
      case 'ideographic':
      case 'hanging':
      case 'middle':
        element.setAttribute( 'dominant-baseline', this._textBaseline ); break;
      default:
        throw new Error( 'impossible to get the SVG approximate bounds for textBaseline: ' + this._textBaseline );
    }
    element.setAttribute( 'direction', this._direction );
    
    // set all of the font attributes, since we can't use the combined one
    element.setAttribute( 'font-family', this._font.getFamily() );
    element.setAttribute( 'font-size', this._font.getSize() );
    element.setAttribute( 'font-style', this._font.getStyle() );
    element.setAttribute( 'font-weight', this._font.getWeight() );
    if ( this._font.getStretch() ) {
      element.setAttribute( 'font-stretch', this._font.getStretch() );
    }
  };
  
  /*---------------------------------------------------------------------------*
  * Bounds
  *----------------------------------------------------------------------------*/
  
  Text.prototype.accurateCanvasBounds = function() {
    var node = this;
    return scenery.Util.canvasAccurateBounds( function( context ) {
      context.font = node.font;
      context.textAlign = node.textAlign;
      context.textBaseline = node.textBaseline;
      context.direction = node.direction;
      context.fillText( node.text, 0, 0 );
    } );
  };
  
  Text.prototype.approximateSVGBounds = function() {
    var isRTL = this._direction === 'rtl';
    
    var svg = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
    svg.setAttribute( 'width', '1024' );
    svg.setAttribute( 'height', '1024' );
    svg.setAttribute( 'style', 'display: hidden;' ); // so we don't flash it in a visible way to the user
    
    var textElement = document.createElementNS( 'http://www.w3.org/2000/svg', 'text' );
    this.updateSVGFragment( textElement );
    
    svg.appendChild( textElement );
    
    document.body.appendChild( svg );
    var rect = textElement.getBBox();
    var result = new Bounds2( rect.x, rect.y, rect.x + rect.width, rect.y + rect.height );
    document.body.removeChild( svg );
    
    return result;
  };
  
  Text.prototype.approximateDOMBounds = function() {
    // TODO: we can also technically support 'top' using vertical-align: top and line-height: 0 with the image, but it won't usually render otherwise
    assert && assert( this._textBaseline === 'alphabetic' );
    
    var maxHeight = 1024; // technically this will fail if the font is taller than this!
    var isRTL = this.direction === 'rtl';
    
    // <div style="position: absolute; left: 0; top: 0; padding: 0 !important; margin: 0 !important;"><span id="baselineSpan" style="font-family: Verdana; font-size: 25px;">QuipTaQiy</span><div style="vertical-align: baseline; display: inline-block; width: 0; height: 500px; margin: 0 important!; padding: 0 important!;"></div></div>
    
    var div = document.createElement( 'div' );
    $( div ).css( {
      position: 'absolute',
      left: 0,
      top: 0,
      padding: '0 !important',
      margin: '0 !important',
      display: 'hidden'
    } );
    
    var span = document.createElement( 'span' );
    $( span ).css( 'font', this.getFont() );
    span.appendChild( document.createTextNode( this.text ) );
    span.setAttribute( 'direction', this._direction );
    
    var fakeImage = document.createElement( 'div' );
    $( fakeImage ).css( {
      'vertical-align': 'baseline',
      display: 'inline-block',
      width: 0,
      height: maxHeight + 'px',
      margin: '0 !important',
      padding: '0 !important'
    } );
    
    div.appendChild( span );
    div.appendChild( fakeImage );
    
    document.body.appendChild( div );
    var rect = span.getBoundingClientRect();
    var divRect = div.getBoundingClientRect();
    var result = new Bounds2( rect.left, rect.top - maxHeight, rect.right, rect.bottom - maxHeight ).shifted( -divRect.left, -divRect.top );
    document.body.removeChild( div );
    
    var width = rect.right - rect.left;
    switch ( this._textAlign ) {
      case 'start':
        result = result.shiftedX( isRTL ? -width : 0 );
        break;
      case 'end':
        result = result.shiftedX( !isRTL ? -width : 0 );
        break;
      case 'left':
        break;
      case 'right':
        result = result.shiftedX( -width );
        break;
      case 'center':
        result = result.shiftedX( -width / 2 );
        break;
    }
    
    return result;
  };
  
  /*---------------------------------------------------------------------------*
  * Self setters / getters
  *----------------------------------------------------------------------------*/
  
  Text.prototype.setFont = function( font ) {
    this._font = font instanceof scenery.Font ? font : new scenery.Font( font );
    this.invalidateText();
    return this;
  };
  
  // NOTE: returns mutable copy for now, consider either immutable version, defensive copy, or note about invalidateText()
  Text.prototype.getFont = function() {
    return this._font.getFont();
  };
  
  Text.prototype.setTextAlign = function( textAlign ) {
    this._textAlign = textAlign;
    this.invalidateText();
    return this;
  };
  
  Text.prototype.getTextAlign = function() {
    return this._textAlign;
  };
  
  Text.prototype.setTextBaseline = function( textBaseline ) {
    this._textBaseline = textBaseline;
    this.invalidateText();
    return this;
  };
  
  Text.prototype.getTextBaseline = function() {
    return this._textBaseline;
  };
  
  Text.prototype.setDirection = function( direction ) {
    this._direction = direction;
    this.invalidateText();
    return this;
  };
  
  Text.prototype.getDirection = function() {
    return this._direction;
  };
  
  /*---------------------------------------------------------------------------*
  * Font setters / getters
  *----------------------------------------------------------------------------*/
  
  function addFontForwarding( propertyName, fullCapitalized, shortUncapitalized ) {
    var getterName = 'get' + fullCapitalized;
    var setterName = 'set' + fullCapitalized;
    
    Text.prototype[getterName] = function() {
      // use the ES5 getter to retrieve the property. probably somewhat slow.
      return this._font[ shortUncapitalized ];
    };
    
    Text.prototype[setterName] = function( value ) {
      // use the ES5 setter. probably somewhat slow.
      this._font[ shortUncapitalized ] = value;
      this.invalidateText();
      return this;
    };
    
    Object.defineProperty( Text.prototype, propertyName, { set: Text.prototype[setterName], get: Text.prototype[getterName] } );
  }
  
  addFontForwarding( 'fontWeight', 'fontWeight', 'weight' );
  addFontForwarding( 'fontFamily', 'fontFamily', 'family' );
  addFontForwarding( 'fontStretch', 'fontStretch', 'stretch' );
  addFontForwarding( 'fontStyle', 'fontStyle', 'style' );
  addFontForwarding( 'fontSize', 'fontSize', 'size' );
  addFontForwarding( 'lineHeight', 'LineHeight', 'lineHeight' );
  
  Text.prototype.hasSelf = function() {
    return true;
  };
  
  Text.prototype._mutatorKeys = [ 'text', 'font', 'fontWeight', 'fontFamily', 'fontStretch', 'fontStyle', 'fontSize', 'lineHeight',
                                  'textAlign', 'textBaseline', 'direction' ].concat( Node.prototype._mutatorKeys );
  
  Text.prototype._supportedBackends = [ Backend.Canvas, Backend.SVG ];
  
  // font-specific ES5 setters and getters are defined using addFontForwarding above
  Object.defineProperty( Text.prototype, 'font', { set: Text.prototype.setFont, get: Text.prototype.getFont } );
  Object.defineProperty( Text.prototype, 'text', { set: Text.prototype.setText, get: Text.prototype.getText } );
  Object.defineProperty( Text.prototype, 'textAlign', { set: Text.prototype.setTextAlign, get: Text.prototype.getTextAlign } );
  Object.defineProperty( Text.prototype, 'textBaseline', { set: Text.prototype.setTextBaseline, get: Text.prototype.getTextBaseline } );
  Object.defineProperty( Text.prototype, 'direction', { set: Text.prototype.setDirection, get: Text.prototype.getDirection } );
  
  // mix in support for fills
  fillable( Text );

  return Text;
} );


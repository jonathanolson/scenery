// Copyright 2002-2013, University of Colorado

/**
 * Mix-in for nodes that support a standard fill.
 *
 * TODO: pattern and gradient handling
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';
  
  var scenery = require( 'SCENERY/scenery' );
  var platform = require( 'PHET_CORE/platform' );
  
  var isSafari5 = platform.safari5;
  
  scenery.Fillable = function Fillable( type ) {
    var proto = type.prototype;
    
    // this should be called in the constructor to initialize
    proto.initializeFillable = function() {
      this._fill = null;
      this._fillPickable = true;
      
      var that = this;
      this._fillListener = function() {
        that.invalidatePaint(); // TODO: move this to invalidateFill?
        that.invalidateFill();
      };
    };
    
    proto.hasFill = function() {
      return this._fill !== null;
    };
    
    proto.getFill = function() {
      return this._fill;
    };
    
    proto.setFill = function( fill ) {
      if ( this.getFill() !== fill ) {
        var hasInstances = this._instances.length > 0;
        
        if ( hasInstances && this._fill && this._fill.removeChangeListener ) {
          this._fill.removeChangeListener( this._fillListener );
        }
        
        this._fill = fill;
        
        if ( hasInstances && this._fill && this._fill.addChangeListener ) {
          this._fill.addChangeListener( this._fillListener );
        }
        
        this.invalidatePaint();
        
        this.invalidateFill();
        
        var stateLen = this._drawables.length;
        for ( var i = 0; i < stateLen; i++ ) {
          this._drawables[i].markDirtyFill();
        }
      }
      return this;
    };
    
    proto.isFillPickable = function() {
      return this._fillPickable;
    };
    
    proto.setFillPickable = function( pickable ) {
      assert && assert( typeof pickable === 'boolean' );
      if ( this._fillPickable !== pickable ) {
        this._fillPickable = pickable;
        
        // TODO: better way of indicating that only the node under pointers could have changed, but no paint change is needed?
        this.invalidateFill();
      }
      return this;
    };
    
    var superFirstInstanceAdded = proto.firstInstanceAdded;
    proto.firstInstanceAdded = function() {
      if ( this._fill && this._fill.addChangeListener ) {
        this._fill.addChangeListener( this._fillListener );
      }
      
      if ( superFirstInstanceAdded ) {
        superFirstInstanceAdded.call( this );
      }
    };
    
    var superLastInstanceRemoved = proto.lastInstanceRemoved;
    proto.lastInstanceRemoved = function() {
      if ( this._fill && this._fill.removeChangeListener ) {
        this._fill.removeChangeListener( this._fillListener );
      }
      
      if ( superLastInstanceRemoved ) {
        superLastInstanceRemoved.call( this );
      }
    };
    
    proto.beforeCanvasFill = function( wrapper ) {
      wrapper.setFillStyle( this._fill );
      if ( this._fill.transformMatrix ) {
        wrapper.context.save();
        this._fill.transformMatrix.canvasAppendTransform( wrapper.context );
      }
    };
    
    proto.afterCanvasFill = function( wrapper ) {
      if ( this._fill.transformMatrix ) {
        wrapper.context.restore();
      }
    };
    
    // TODO: this is deprecated, remove!
    proto.getSVGFillStyle = function() {
      var style = 'fill: ';
      if ( !this._fill ) {
        // no fill
        style += 'none;';
      } else if ( this._fill.toCSS ) {
        // Color object fill
        style += this._fill.toCSS() + ';';
      } else if ( this._fill.getSVGDefinition ) {
        // reference the SVG definition with a URL
        style += 'url(#fill' + this.getId() + ');';
      } else {
        // plain CSS color
        style += this._fill + ';';
      }
      return style;
    };
    
    proto.getCSSFill = function() {
      // if it's a Color object, get the corresponding CSS
      // 'transparent' will make us invisible if the fill is null
      return this._fill ? ( this._fill.toCSS ? this._fill.toCSS() : this._fill ) : 'transparent';
    };
    
    proto.addSVGFillDef = function( svg, defs ) {
      var fill = this.getFill();
      var fillId = 'fill' + this.getId();
      
      // add new definitions if necessary
      if ( fill && fill.getSVGDefinition ) {
        defs.appendChild( fill.getSVGDefinition( fillId ) );
      }
    };
    
    proto.removeSVGFillDef = function( svg, defs ) {
      var fillId = 'fill' + this.getId();
      
      // wipe away any old definition
      var oldFillDef = svg.getElementById( fillId );
      if ( oldFillDef ) {
        defs.removeChild( oldFillDef );
      }
    };
    
    proto.appendFillablePropString = function( spaces, result ) {
      if ( this._fill ) {
        if ( result ) {
          result += ',\n';
        }
        if ( typeof this._fill === 'string' ) {
          result += spaces + 'fill: \'' + this._fill + '\'';
        } else {
          result += spaces + 'fill: ' + this._fill.toString();
        }
      }
      
      return result;
    };
    
    proto.getFillRendererBitmask = function() {
      var bitmask = 0;
      
      // Safari 5 has buggy issues with SVG gradients
      if ( !( isSafari5 && this._fill && this._fill.isGradient ) ) {
        bitmask |= scenery.bitmaskSupportsSVG;
      }
      
      // we always have Canvas support?
      bitmask |= scenery.bitmaskSupportsCanvas;
      
      // nothing in the fill can change whether its bounds are valid
      bitmask |= scenery.bitmaskBoundsValid;
      
      if ( !this._fill ) {
        // if there is no fill, it is supported by DOM
        bitmask |= scenery.bitmaskSupportsDOM;
      } else if ( this._fill.isPattern ) {
        // no pattern support for DOM (for now!)
      } else if ( this._fill.isGradient ) {
        // no gradient support for DOM (for now!)
      } else {
        // solid fills always supported for DOM
        bitmask |= scenery.bitmaskSupportsDOM;
      }
      
      return bitmask;
    };
    
    // on mutation, set the fill parameter first
    proto._mutatorKeys = [ 'fill', 'fillPickable' ].concat( proto._mutatorKeys );
    
    Object.defineProperty( proto, 'fill', { set: proto.setFill, get: proto.getFill } );
    Object.defineProperty( proto, 'fillPickable', { set: proto.setFillPickable, get: proto.isFillPickable } );
    
    if ( proto.invalidateFill ) {
      var oldInvalidateFill = proto.invalidateFill;
      proto.invalidateFill = function() {
        this.invalidateSupportedRenderers();
        oldInvalidateFill.call( this );
      };
    } else {
      proto.invalidateFill = function() {
        this.invalidateSupportedRenderers();
      };
    }
  };
  var Fillable = scenery.Fillable;
  
  // mix-in base for DOM and SVG drawables
  // NOTE: requires state.node to be defined
  Fillable.FillableState = function FillableState( stateType ) {
    var proto = stateType.prototype;
    
    proto.initializeFillableState = function() {
      this.lastFill = undefined;
      this.dirtyFill = true;
    };
    
    proto.cleanFillableState = function() {
      this.dirtyFill = false;
      this.lastFill = this.node.getFill();
    };
    
    proto.markDirtyFill = function() {
      this.dirtyFill = true;
      this.markPaintDirty();
    };
  };
  
  // mix-in for Canvas drawables
  Fillable.FillableStateless = function FillableStateless( stateType ) {
    var proto = stateType.prototype;
    
    proto.markDirtyFill = function() {
      this.markPaintDirty();
    };
  };
  
  var fillableSVGIdCounter = 0;
  
  // handles SVG defs and fill style for SVG elements (by composition, not a mix-in or for inheritance)
  Fillable.FillSVGState = function FillSVGState() {
    this.id = 'svgfill' + ( fillableSVGIdCounter++ );
    
    this.initialize();
  };
  Fillable.FillSVGState.prototype = {
    constructor: Fillable.FillSVGState,
    
    initialize: function() {
      this.fill = null;
      this.def = null;
      
      // this is used by the actual SVG element
      this.style = this.computeStyle();
    },
    
    dispose: function() {
      // be cautious, release references
      this.fill = null;
      this.releaseDef();
    },
    
    releaseDef: function() {
      if ( this.def ) {
        this.def.parentNode.removeChild( this.def );
        this.def = null;
      }
    },
    
    // called when the fill needs to be updated, with the latest defs SVG block
    updateFill: function( defs, fill ) {
      if ( fill !== this.fill ) {
        this.releaseDef();
        this.fill = fill;
        this.style = this.computeStyle();
        if ( this.fill && this.fill.getSVGDefinition ) {
          this.def = this.fill.getSVGDefinition( this.id );
          defs.appendChild( this.def );
        }
      }
    },
    
    // called when the defs SVG block is switched (our SVG element was moved to another SVG top-level context)
    updateDefs: function( defs ) {
      if ( this.def ) {
        this.def.parentNode.removeChild( this.def );
        defs.appendChild( this.def );
      }
    },
    
    computeStyle: function() {
      var style = 'fill: ';
      if ( !this.fill ) {
        // no fill
        style += 'none;';
      } else if ( this.fill.toCSS ) {
        // Color object fill
        style += this.fill.toCSS() + ';';
      } else if ( this.fill.getSVGDefinition ) {
        // reference the SVG definition with a URL
        style += 'url(#' + this.id + ');';
      } else {
        // plain CSS color
        style += this.fill + ';';
      }
      return style;
    }
  };
  
  return Fillable;
} );



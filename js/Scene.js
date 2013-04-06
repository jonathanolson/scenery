// Copyright 2002-2012, University of Colorado

/**
 * Main scene, that is also a Node.
 *
 * TODO: documentation!
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  "use strict";
  
  var assert = require( 'ASSERT/assert' )( 'scenery' );
  
  var collect = require( 'PHET_CORE/collect' );
  
  var Bounds2 = require( 'DOT/Bounds2' );
  var Vector2 = require( 'DOT/Vector2' );
  var Matrix3 = require( 'DOT/Matrix3' );
  
  var scenery = require( 'SCENERY/scenery' );
  
  var Node = require( 'SCENERY/nodes/Node' ); // inherits from Node
  require( 'SCENERY/util/Trail' );
  require( 'SCENERY/util/TrailInterval' );
  require( 'SCENERY/util/TrailPointer' );
  require( 'SCENERY/input/Input' );
  require( 'SCENERY/layers/LayerBuilder' );
  require( 'SCENERY/layers/Renderer' );
  
  var Util = require( 'SCENERY/util/Util' );
  var objectCreate = Util.objectCreate;
  
  // if assertions are enabled, log out layer information
  var layerLogger = null; //assert ? function( ob ) { console.log( ob ); } : null;
  
  // debug flag to disable matching of layers when in 'match' mode
  var forceNewLayers = true; // DEBUG
  
  /*
   * $main should be a block-level element with a defined width and height. scene.resize() should be called whenever
   * it is resized.
   *
   * Valid parameters in the parameter object:
   * {
   *   allowSceneOverflow: false,           // usually anything displayed outside of this $main (DOM/CSS3 transformed SVG) is hidden with CSS overflow
   *   allowCSSHacks: true,                 // applies styling that prevents mobile browser graphical issues
   *   allowDevicePixelRatioScaling: false, // allows underlying canvases (Canvas, WebGL) to increase in size to maintain sharpness on high-density displays
   *   enablePointerEvents: true,           // allows pointer events / MSPointerEvent to be used on supported platforms.
   *   preferredSceneLayerType: ...,        // sets the preferred type of layer to be created if there are multiple options
   *   width: <current main width>,         // override the main container's width
   *   height: <current main height>,       // override the main container's height
   * }
   */
  scenery.Scene = function Scene( $main, options ) {
    assert && assert( $main[0], 'A main container is required for a scene' );
    
    // defaults
    options = _.extend( {
      allowSceneOverflow: false,
      allowCSSHacks: true,
      allowDevicePixelRatioScaling: false,
      enablePointerEvents: true,
      preferredSceneLayerType: scenery.CanvasDefaultLayerType,
      width: $main.width(),
      height: $main.height()
    }, options || {} );
    
    // TODO: consider using a pushed preferred layer to indicate this information, instead of as a specific option
    this.backingScale = options.allowDevicePixelRatioScaling ? Util.backingScale( document.createElement( 'canvas' ).getContext( '2d' ) ) : 1;
    this.enablePointerEvents = options.enablePointerEvents;
    
    Node.call( this, options );
    
    var scene = this;
    window.debugScene = scene;
    
    // layering data
    this.layers = [];               // main layers in a scene
    this.trailLayerMap = {};        // maps every single painted trail to its current layer. helpful for fast lookup, and crucial during layer stitching operations
    this.oldTrailLayerMap = {};     // stores references to old layers for removed trails which may be needed for stitching. cleared after each stitching
    this.layerChangeIntervals = []; // array of {TrailInterval}s indicating what parts need to be stitched together. cleared after each stitching
    
    this.lastCursor = null;
    this.defaultCursor = $main.css( 'cursor' );
    
    this.$main = $main;
    // resize the main container as a sanity check
    this.setSize( options.width, options.height );
    
    this.sceneBounds = new Bounds2( 0, 0, $main.width(), $main.height() );
    
    // default to a canvas layer type, but this can be changed
    this.preferredSceneLayerType = options.preferredSceneLayerType;
    
    applyCSSHacks( $main, options );
    
    // note, arguments to the functions are mutable. don't destroy them
    this.sceneEventListener = {
      markForLayerRefresh: function( args ) { // contains trail
        layerLogger && layerLogger( 'marking layer refresh: ' + args.trail.toString() );
        scene.markInterval( args.trail );
      },
      
      markForInsertion: function( args ) { // contains parent, child, index, trail
        var affectedTrail = args.trail.copy().addDescendant( args.child );
        layerLogger && layerLogger( 'marking insertion: ' + affectedTrail.toString() );
        scene.markInterval( affectedTrail );
      },
      
      markForRemoval: function( args ) { // contains parent, child, index, trail
        // mark the interval
        var affectedTrail = args.trail.copy().addDescendant( args.child );
        layerLogger && layerLogger( 'marking removal: ' + affectedTrail.toString() );
        scene.markInterval( affectedTrail );
        
        // signal to the relevant layers to remove the specified trail while the trail is still valid.
        // waiting until after the removal takes place would require more complicated code to properly handle the trails
        affectedTrail.eachTrailUnder( function( trail ) {
          if ( trail.isPainted() ) {
            var trailId = trail.getUniqueId();
            var layer = scene.layerLookup( trail );
            
            // store the trail's layer reference in the old map that will be cleared after stitching. we need a reference to properly handle situations
            scene.oldTrailLayerMap[trailId] = layer;
            
            // and remove the trail now. TODO: can we do this removal later, since all oldTrailLayerMap nodes should essentially be removed?
            scene.removeTrailFromLayer( trail, layer );
          }
        } );
      },
      
      stitch: function( args ) { // contains match {Boolean}
        scene.stitch( args.match );
      },
      
      dirtyBounds: function( args ) { // contains node, bounds, transform, trail
        var trail = args.trail;
        
        // if there are no layers, no nodes would actually render, so don't do the lookup
        if ( scene.layers.length ) {
          _.each( scene.affectedLayers( trail ), function( layer ) {
            layer.markDirtyRegion( args );
          } );
        }
      },
      
      transform: function( args ) { // conatins node, type, matrix, transform, trail
        var trail = args.trail;
        
        if ( scene.layers.length ) {
          _.each( scene.affectedLayers( trail ), function( layer ) {
            layer.transformChange( args );
          } );
        }
      }
    };
    
    this.addEventListener( this.sceneEventListener );
  };
  var Scene = scenery.Scene;

  Scene.prototype = objectCreate( Node.prototype );
  Scene.prototype.constructor = Scene;
  
  Scene.prototype.updateScene = function( args ) {
    // validating bounds, similar to Piccolo2d
    this.validateBounds();
    this.validatePaint();
    
    // bail if there are no layers. consider a warning?
    if ( !this.layers.length ) {
      return;
    }
    
    var scene = this;
    
    _.each( this.layers, function( layer ) {
      layer.render( scene, args );
    } );
    
    this.updateCursor();
  };
  
  Scene.prototype.renderScene = function() {
    // TODO: for now, go with the same path. possibly add options later
    this.updateScene();
  };
  
  Scene.prototype.addTrailToLayer = function( trail, layer ) {
    layerLogger && layerLogger( '  addition of trail ' + trail.toString() + ' from layer ' + layer.getId() );
    this.trailLayerMap[trail.getUniqueId()] = layer;
    layer.addNodeFromTrail( trail );
  };
  
  Scene.prototype.moveTrailFromLayerToLayer = function( trail, oldLayer, newLayer ) {
    layerLogger && layerLogger( '  moving trail ' + trail.toString() + ' from layer ' + oldLayer.getId() + ' to layer ' + newLayer.getId() );
    this.trailLayerMap[trail.getUniqueId()] = newLayer;
    oldLayer.removeNodeFromTrail( trail );
    newLayer.addNodeFromTrail( trail );
  };
  
  Scene.prototype.removeTrailFromLayer = function( trail, layer ) {
    layerLogger && layerLogger( '  removal of trail ' + trail.toString() + ' from layer ' + layer.getId() );
    
    // we don't want to leak memory, so since we don't know if this trail will continue to exist, ditch the reference
    delete this.trailLayerMap[trail.getUniqueId()];
    layer.removeNodeFromTrail( trail );
  };
  
  Scene.prototype.markInterval = function( affectedTrail ) {
    // since this is marked while the child is still connected, we can use our normal trail handling.
    
    // find the closest before and after self trails that are not affected
    var beforeTrail = affectedTrail.previousPainted(); // easy for the before trail
    
    var afterTrailPointer = new scenery.TrailPointer( affectedTrail.copy(), false );
    while ( afterTrailPointer.hasTrail() && ( !afterTrailPointer.isBefore || !afterTrailPointer.trail.isPainted() ) ) {
      afterTrailPointer.nestedForwards();
    }
    var afterTrail = afterTrailPointer.trail;
    
    // store the layer of the before/after trails so that it is easy to access later
    this.addLayerChangeInterval( new scenery.TrailInterval(
      beforeTrail,
      afterTrail,
      beforeTrail ? this.layerLookup( beforeTrail ) : null,
      afterTrail ? this.layerLookup( afterTrail ) : null
    ) );
  };
  
  // convenience function for layer change intervals
  Scene.prototype.addLayerChangeInterval = function( interval ) {
    if ( layerLogger ) {
      layerLogger( 'adding interval: ' + interval.toString() + ' to intervals:' );
      _.each( this.layerChangeIntervals, function( interval ) {
        layerLogger( '  ' + interval.toString() );
      } );
    }
    
    // TODO: replace with a binary-search-like version that may be faster. this includes a full scan
    
    // attempt to merge this interval with another if possible.
    for ( var i = 0; i < this.layerChangeIntervals.length; i++ ) {
      var other = this.layerChangeIntervals[i];
      other.reindex(); // sanity check, although for most use-cases this should be unnecessary
      
      if ( interval.exclusiveUnionable( other ) ) {
        // the interval can be unioned without including other nodes. do this, and remove the other interval from consideration
        interval = interval.union( other );
        this.layerChangeIntervals.splice( i--, 1 ); // decrement to stay at the same index
        layerLogger && layerLogger( 'removing interval: ' + other.toString() );
      }
    }
    
    this.layerChangeIntervals.push( interval );
    
    if ( layerLogger ) {
      layerLogger( 'new intervals: ' );
      _.each( this.layerChangeIntervals, function( interval ) {
        layerLogger( '  ' + interval.toString() );
      } );
      layerLogger( '---' );
    }
  };
  
  Scene.prototype.createLayer = function( layerType, layerArgs, startBoundary, endBoundary ) {
    var layer = layerType.createLayer( _.extend( {
      startBoundary: startBoundary,
      endBoundary: endBoundary
    }, layerArgs ) );
    layer.type = layerType;
    layerLogger && layerLogger( 'created layer: ' + layer.getId() + ' of type ' + layer.type.name );
    return layer;
  };
  
  // insert a layer into the proper place (from its starting boundary)
  Scene.prototype.insertLayer = function( layer ) {
    if ( this.layers.length > 0 && this.layers[0].startBoundary.equivalentPreviousTrail( layer.endBoundary.previousPaintedTrail ) ) {
      // layer needs to be inserted at the very beginning
      this.layers.unshift( layer );
    } else {
      for ( var i = 0; i < this.layers.length; i++ ) {
        // compare end and start boundaries, as they should match
        if ( this.layers[i].endBoundary.equivalentNextTrail( layer.startBoundary.nextPaintedTrail ) ) {
          break;
        }
      }
      if ( i < this.layers.length ) {
        this.layers.splice( i + 1, 0, layer );
      } else {
        this.layers.push( layer );
      }
    }
  };
  
  Scene.prototype.calculateBoundaries = function( beforeLayerType, beforeTrail, afterTrail ) {
    layerLogger && layerLogger( 'build between ' + ( beforeTrail ? beforeTrail.toString() : beforeTrail ) + ',' + ( afterTrail ? afterTrail.toString() : afterTrail ) + ' with beforeType: ' + ( beforeLayerType ? beforeLayerType.name : null ) );
    var builder = new scenery.LayerBuilder( this, beforeLayerType, beforeTrail, afterTrail );
    
    // push the preferred layer type before we push that for any nodes
    if ( this.preferredSceneLayerType ) {
      builder.pushPreferredLayerType( this.preferredSceneLayerType );
    }
    
    builder.run();
    
    return builder.boundaries;
  };
  
  Scene.prototype.stitch = function( match ) {
    var scene = this;
    
    // data to be shared across all of the individually stitched intervals
    var stitchData = {
      // We need to map old layer IDs to new layers if we 'glue' two layers into one,
      // so that the layer references we put on the intervals can be mapped to current layers.
      // layer ID => layer
      layerMap: {},
      
      // all trails that are affected, in no particular order
      affectedTrails: [],
      
      // trail ID => layer at the end of stitching (needed to batch the layer notifications)
      newLayerMap: {}, // will be set in stitching operations
      
      layersToAdd: [],
      
      layersToRemove: []
    };
    
    // default arguments for constructing layers
    var layerArgs = {
      $main: this.$main,
      scene: this,
      baseNode: this
    };
    
    _.each( this.layerChangeIntervals, function( interval ) {
      // reindex intervals, since their endpoints indices may need to be updated
      interval.reindex();
    } );
    
    /*
     * Sort our intervals, so that when we need to 'unglue' a layer into two separate layers, we will have passed
     * all of the parts where we would need to use the 'before' layer, so we can update our layer map with the 'after'
     * layer.
     */
    this.layerChangeIntervals.sort( scenery.TrailInterval.compareDisjoint );
    
    layerLogger && layerLogger( 'stitching on intervals: \n' + this.layerChangeIntervals.join( '\n' ) );
    
    _.each( this.layerChangeIntervals, function( interval ) {
      layerLogger && layerLogger( 'stitch on interval ' + interval.toString() );
      var beforeTrail = interval.a;
      var afterTrail = interval.b;
      
      // stored here, from in markInterval
      var beforeLayer = interval.dataA;
      var afterLayer = interval.dataB;
      
      // if these layers are out of date, update them. 'while' will handle chained updates. circular references should be impossible
      while ( beforeLayer && stitchData.layerMap[beforeLayer.getId()] ) {
        beforeLayer = stitchData.layerMap[beforeLayer.getId()];
      }
      while ( afterLayer && stitchData.layerMap[afterLayer.getId()] ) {
        afterLayer = stitchData.layerMap[afterLayer.getId()];
      }
      
      var boundaries = scene.calculateBoundaries( beforeLayer ? beforeLayer.type : null, beforeTrail, afterTrail );
      
      scene.stitchInterval( stitchData, layerArgs, beforeTrail, afterTrail, beforeLayer, afterLayer, boundaries, match );
    } );
    layerLogger && layerLogger( 'finished intervals in stitching' );
    
    // cleanup after layers all of the intervals have been stitched
    _.each( stitchData.layersToRemove, function( layer ) {
      layerLogger && layerLogger( 'disposing layer: ' + layer.getId() );
      scene.disposeLayer( layer );
    } );
    _.each( stitchData.layersToAdd, function( layer ) {
      layerLogger && layerLogger( 'inserting layer: ' + layer.getId() );
      scene.insertLayer( layer );
    } );
    this.reindexLayers();
    
    // before notifying layers of added/removed trails, make our internal state consistent, since the add/remove may trigger side effects
    var beforeTrailLayerMap = {}; // we dump any previous trail-layer mappings here, so we can get the correct removal down below when we do the add/remove
    _.each( stitchData.affectedTrails, function( trail ) {
      var trailId = trail.getUniqueId();
      
      // store the old layer (if any)
      beforeTrailLayerMap[trailId] = scene.trailLayerMap[trailId];
      
      // store our new layer so layerLookup will return the new consistent state
      scene.trailLayerMap[trailId] = stitchData.newLayerMap[trailId];
    } );
    
    // add/remove trails from their necessary layers
    var processedTrails = {}; // store references to trail IDs that were processed, since trails could be added to our affectedTrails multiple times
    _.each( stitchData.affectedTrails, function( trail ) {
      var trailId = trail.getUniqueId();
      
      if ( !processedTrails[trailId] ) {
        processedTrails[trailId] = true; // mark as processed, so we don't process another equivalent trail that was added later
        
        // sanity check, since these will be stored by the layers
        trail.setImmutable();
        
        // don't do a layer lookup to determine the current layer (we already modified that state to be consistent).
        var currentLayer = beforeTrailLayerMap[trailId];
        var newLayer = stitchData.newLayerMap[trailId];
        
        if ( currentLayer !== newLayer ) {
          if ( currentLayer ) {
            scene.moveTrailFromLayerToLayer( trail, currentLayer, newLayer );
          } else {
            scene.addTrailToLayer( trail, newLayer );
          }
        }
      }
    } );
    
    // clean up state that was set leading up to the stitching
    this.oldTrailLayerMap = {};
    this.layerChangeIntervals = [];
    
    // TODO: add this back in, but with an appropriate assertion level
    assert && assert( this.layerAudit() );
  };
  
  /*
   * Stitching intervals has essentially two specific modes:
   * non-matching: handles added or removed nodes (and this can span multiple, even adjacent trails)
   * matching: handles in-place layer refreshes (no nodes removed or added, but something like a renderer was changed)
   *
   * This separation occurs since for matching, we want to match old layers with possible new layers, so we can keep trails in their
   * current layer instead of creating an identical layer and moving the trails to that layer.
   *
   * The stitching basically re-does the layering between a start and end trail, attempting to minimize the amount of changes made.
   * It can include 'gluing' layers together (a node that caused layer splits was removed, and before/after layers are joined),
   * 'ungluing' layers (an inserted node causes a layer split in an existing layer, and it is separated into a before/after),
   * or normal updating of the interior.
   *
   * The beforeTrail and afterTrail should be outside the modifications, and if the modifications are to the start/end of the graph,
   * they should be passed as null to indicate 'before everything' and 'after everything' respectively.
   *
   * Here be dragons!
   */
  Scene.prototype.stitchInterval = function( stitchData, layerArgs, beforeTrail, afterTrail, beforeLayer, afterLayer, boundaries, match ) {
    var scene = this;
    
    // make sure our beforeTrail and afterTrail are immutable
    beforeTrail && beforeTrail.setImmutable();
    afterTrail && afterTrail.setImmutable();
    
    // need a reference to this, since it may change
    var afterLayerEndBoundary = afterLayer ? afterLayer.endBoundary : null;
    
    var beforeLayerIndex = beforeLayer ? _.indexOf( this.layers, beforeLayer ) : -1;
    var afterLayerIndex = afterLayer ? _.indexOf( this.layers, afterLayer ) : this.layers.length;
    
    var beforePointer = beforeTrail ? new scenery.TrailPointer( beforeTrail, true ) : new scenery.TrailPointer( new scenery.Trail( this ), true );
    var afterPointer = afterTrail ? new scenery.TrailPointer( afterTrail, true ) : new scenery.TrailPointer( new scenery.Trail( this ), false );
    
    layerLogger && layerLogger( 'stitching with boundaries:\n' + _.map( boundaries, function( boundary ) { return boundary.toString(); } ).join( '\n' ) );
    
    // maps trail unique ID => layer, only necessary when matching since we need to remove trails from their old layers
    var oldLayerMap = match ? this.mapTrailLayersBetween( beforeTrail, afterTrail ) : null;
    
    /*---------------------------------------------------------------------------*
    * State
    *----------------------------------------------------------------------------*/
    
    var nextBoundaryIndex = 0;
    var nextBoundary = boundaries[nextBoundaryIndex];
    var trailsToAddToLayer = [];
    var currentTrail = beforeTrail;
    var currentLayer = beforeLayer;
    var currentLayerType = beforeLayer ? beforeLayer.type : null;
    var currentStartBoundary = null;
    var matchingLayer = null; // set whenever a trail has a matching layer, cleared after boundary
    
    // a list of layers that are most likely removed, not including the afterLayer for gluing
    for ( var i = beforeLayerIndex + 1; i < afterLayerIndex; i++ ) {
      // TODO: this seems like a failure point for multiple stitches
      stitchData.layersToRemove.push( this.layers[i] );
    }
    
    function addPendingTrailsToLayer() {
      // add the necessary nodes to the layer
      _.each( trailsToAddToLayer, function( trail ) {
        changeTrailLayer( trail, currentLayer );
      } );
      trailsToAddToLayer = [];
    }
    
    function addLayerForRemoval( layer ) {
      if ( !_.contains( stitchData.layersToRemove, layer ) ) {
        stitchData.layersToRemove.push( afterLayer );
      }
    }
    
    function addAndCreateLayer( startBoundary, endBoundary ) {
      currentLayer = scene.createLayer( currentLayerType, layerArgs, startBoundary, endBoundary );
      stitchData.layersToAdd.push( currentLayer );
    }
    
    function changeTrailLayer( trail, layer ) {
      layerLogger && layerLogger( '  moving trail ' + trail.toString() + ' to layer ' + layer.getId() );
      stitchData.affectedTrails.push( trail ); // don't check for duplicates now, we get better performance by performing uniqueness tests afterwards
      stitchData.newLayerMap[trail.getUniqueId()] = layer;
    }
    
    function step( trail, isEnd ) {
      layerLogger && layerLogger( 'step: ' + ( trail ? trail.toString() : trail ) );
      trail && trail.setImmutable(); // we don't want our trail to be modified, so we can store direct references to it
      // check for a boundary at this step between currentTrail and trail
      
      // if there is no next boundary, don't bother checking anyways
      if ( nextBoundary && nextBoundary.equivalentPreviousTrail( currentTrail ) ) { // at least one null check
        assert && assert( nextBoundary.equivalentNextTrail( trail ) );
        
        layerLogger && layerLogger( nextBoundary.toString() );
        
        // we are at a boundary change. verify that we are at the end of a layer
        if ( currentLayer || currentStartBoundary ) {
          if ( currentLayer ) {
            layerLogger && layerLogger( 'has currentLayer: ' + currentLayer.getId() );
            // existing layer, reposition its endpoint
            currentLayer.setEndBoundary( nextBoundary );
          } else {
            assert && assert( currentStartBoundary );
            
            if ( matchingLayer ) {
              layerLogger && layerLogger( 'matching layer used: ' + matchingLayer.getId() );
              matchingLayer.setStartBoundary( currentStartBoundary );
              matchingLayer.setEndBoundary( nextBoundary );
              currentLayer = matchingLayer;
            } else {
              layerLogger && layerLogger( 'creating layer' );
              addAndCreateLayer( currentStartBoundary, nextBoundary ); // sets currentLayer
            }
          }
          // sanity checks
          assert && assert( currentLayer.startPaintedTrail );
          assert && assert( currentLayer.endPaintedTrail );
          
          addPendingTrailsToLayer();
        } else {
          // if not at the end of a layer, sanity check that we should have no accumulated pending trails
          layerLogger && layerLogger( 'was first layer' );
          assert && assert( trailsToAddToLayer.length === 0 );
        }
        currentLayer = null;
        currentLayerType = nextBoundary.nextLayerType;
        currentStartBoundary = nextBoundary;
        matchingLayer = null;
        nextBoundaryIndex++;
        nextBoundary = boundaries[nextBoundaryIndex];
      }
      if ( trail && !isEnd ) {
        trailsToAddToLayer.push( trail );
      }
      if ( match && !isEnd ) { // TODO: verify this condition with test cases
        // if the node's old layer is compatible
        var layer = scene.layerLookup( trail ); // lookup should return the old layer from the system
        if ( layer.type === currentLayerType && !forceNewLayers ) {
          // TODO: we need to handle compatibility with layer splits. using forceNewLayers flag to temporarily disable
          matchingLayer = layer;
        }
      }
      currentTrail = trail;
    }
    
    function startStep( trail ) {
      layerLogger && layerLogger( 'startStep: ' + ( trail ? trail.toString() : trail ) );
    }
    
    function middleStep( trail ) {
      layerLogger && layerLogger( 'middleStep: ' + trail.toString() );
      step( trail, false );
    }
    
    function endStep( trail ) {
      layerLogger && layerLogger( 'endStep: ' + ( trail ? trail.toString() : trail ) );
      step( trail, true );
      
      if ( beforeLayer !== afterLayer && boundaries.length === 0 ) {
        // glue the layers together
        layerLogger && layerLogger( 'gluing layer' );
        layerLogger && layerLogger( 'endBoundary: ' + afterLayer.endBoundary.toString() );
        beforeLayer.setEndBoundary( afterLayer.endBoundary );
        addLayerForRemoval( afterLayer );
        currentLayer = beforeLayer;
        addPendingTrailsToLayer();
        
        // move over all of afterLayer's trails to beforeLayer
        // defensive copy needed, since this will be modified at the same time
        _.each( afterLayer._layerTrails.slice( 0 ), function( trail ) {
          trail.reindex();
          changeTrailLayer( trail, beforeLayer );
        } );
        
        stitchData.layerMap[afterLayer.getId()] = beforeLayer;
      } else if ( beforeLayer && beforeLayer === afterLayer && boundaries.length > 0 ) {
        // need to 'unglue' and split the layer
        layerLogger && layerLogger( 'ungluing layer' );
        assert && assert( currentStartBoundary );
        addAndCreateLayer( currentStartBoundary, afterLayerEndBoundary ); // sets currentLayer
        stitchData.layerMap[afterLayer.getId()] = currentLayer;
        addPendingTrailsToLayer();
        
        scenery.Trail.eachPaintedTrailBetween( afterTrail, currentLayer.endPaintedTrail, function( subtrail ) {
          subtrail = subtrail.copy();
          subtrail.setImmutable(); // we are storing references to this trail
          changeTrailLayer( subtrail, currentLayer );
        }, false, scene );
      } else if ( !beforeLayer && !afterLayer && boundaries.length === 1 && !boundaries[0].hasNext() && !boundaries[0].hasPrevious() ) {
        // TODO: why are we generating a boundary here?!?
      } else {
        currentLayer = afterLayer;
        // TODO: check concepts on this guard, since it seems sketchy
        if ( currentLayer && currentStartBoundary ) {
          currentLayer.setStartBoundary( currentStartBoundary );
        }
        
        addPendingTrailsToLayer();
      }
    }
    
    // iterate from beforeTrail up to BEFORE the afterTrail. does not include afterTrail
    startStep( beforeTrail );
    beforePointer.eachTrailBetween( afterPointer, function( trail ) {
      // ignore non-self trails
      if ( !trail.isPainted() || ( beforeTrail && trail.equals( beforeTrail ) ) ) {
        return;
      }
      
      middleStep( trail.copy() );
    } );
    endStep( afterTrail );
  };
  
  // returns a map from trail.getUniqueId() to the current layer in which that trail resides
  Scene.prototype.mapTrailLayersBetween = function( beforeTrail, afterTrail, result ) {
    var scene = this;
    
    // allow providing a result to copy into, so we can chain these
    result = result || {};
    
    scenery.Trail.eachPaintedTrailBetween( beforeTrail, afterTrail, function( trail ) {
      // TODO: optimize this! currently both the layer lookup and this inefficient method of using layer lookup is slow
      var layer = scene.layerLookup( trail );
      assert && assert( layer, 'each trail during a proper match should always have a layer' );
      result[trail.getUniqueId()] = layer;
    }, false, this );
    
    return result;
  };
  
  Scene.prototype.rebuildLayers = function() {
    layerLogger && layerLogger( 'rebuildLayers' );
    
    // mark the entire scene 
    this.markInterval( new scenery.Trail( this ) );
    
    // then stitch with match=true
    this.stitch( true );
  };
  
  // after layer changes, the layers should have their zIndex updated
  Scene.prototype.reindexLayers = function() {
    var index = 1;
    _.each( this.layers, function( layer ) {
      // layers increment indices as needed
      index = layer.reindex( index );
    } );
  };
  
  Scene.prototype.dispose = function() {
    this.disposeLayers();
    
    // TODO: clear event handlers if added
    //throw new Error( 'unimplemented dispose: clear event handlers if added' );
  };
  
  Scene.prototype.disposeLayer = function( layer ) {
    layer.dispose();
    this.layers.splice( _.indexOf( this.layers, layer ), 1 ); // TODO: better removal code!
  };
  
  Scene.prototype.disposeLayers = function() {
    var scene = this;
    
    _.each( this.layers.slice( 0 ), function( layer ) {
      scene.disposeLayer( layer );
    } );
  };
  
  // what layer does this trail's terminal node render in? returns null if the node is not contained in a layer
  Scene.prototype.layerLookup = function( trail ) {
    assert && assert( !( trail.isEmpty() || trail.nodes[0] !== this ), 'layerLookup root matches' );
    assert && assert( trail.isPainted(), 'layerLookup only supports nodes with isPainted(), as this guarantees an unambiguous answer' );
    
    if ( this.layers.length === 0 ) {
      return null; // node not contained in a layer
    }
    
    var trailId = trail.getUniqueId();
    var layer = this.trailLayerMap[trailId];
    
    // if the trail isn't in the main map, it was probably removed (we're in the stitching process, it's in the temporary map), or it's added and we have no reference
    if ( !layer ) {
      layer = this.oldTrailLayerMap[trailId];
      
      // it's not referenced, so return null
      if ( !layer ) {
        layer = null;
      }
    }
    
    return layer;
  };
  
  // all layers whose start or end points lie inclusively in the range from the trail's before and after
  Scene.prototype.affectedLayers = function( trail ) {
    // TODO: add tree form for optimization! this is slower than necessary, it shouldn't be O(n)!
    
    var result = [];
    
    assert && assert( !( trail.isEmpty() || trail.nodes[0] !== this ), 'layerLookup root matches' );
    
    if ( this.layers.length === 0 ) {
      throw new Error( 'no layers in the scene' );
    }
    
    // point to the beginning of the node, right before it would be rendered
    var startPointer = new scenery.TrailPointer( trail, true );
    var endPointer = new scenery.TrailPointer( trail, false );
    
    for ( var i = 0; i < this.layers.length; i++ ) {
      var layer = this.layers[i];
      
      var notBefore = endPointer.compareNested( new scenery.TrailPointer( layer.startPaintedTrail, true ) ) !== -1;
      var notAfter = startPointer.compareNested( new scenery.TrailPointer( layer.endPaintedTrail, true ) ) !== 1;
      
      if ( notBefore && notAfter ) {
        result.push( layer );
      }
    }
    
    return result;
  };
  
  // attempt to render everything currently visible in the scene to an external canvas. allows copying from canvas layers straight to the other canvas
  Scene.prototype.renderToCanvas = function( canvas, context, callback ) {
    var count = 0;
    var started = false; // flag guards against asynchronous tests that call back synchronously (immediate increment and decrement)
    var delayCounts = {
      increment: function() {
        count++;
      },
      
      decrement: function() {
        count--;
        if ( count === 0 && callback && started ) {
          callback();
        }
      }
    };
    
    context.clearRect( 0, 0, canvas.width, canvas.height );
    _.each( this.layers, function( layer ) {
      layer.renderToCanvas( canvas, context, delayCounts );
    } );
    
    if ( count === 0 ) {
      // no asynchronous layers, callback immediately
      if ( callback ) {
        callback();
      }
    } else {
      started = true;
    }
  };
  
  // TODO: consider SVG data URLs
  
  Scene.prototype.canvasDataURL = function( callback ) {
    this.canvasSnapshot( function( canvas ) {
      callback( canvas.toDataURL() );
    } );
  };
  
  // renders what it can into a Canvas (so far, Canvas and SVG layers work fine)
  Scene.prototype.canvasSnapshot = function( callback ) {
    var canvas = document.createElement( 'canvas' );
    canvas.width = this.sceneBounds.getWidth();
    canvas.height = this.sceneBounds.getHeight();
    
    var context = canvas.getContext( '2d' );
    this.renderToCanvas( canvas, context, function() {
      callback( canvas, context.getImageData( 0, 0, canvas.width, canvas.height ) );
    } );
  };
  
  Scene.prototype.setSize = function( width, height ) {
    // resize our main container
    this.$main.width( width );
    this.$main.height( height );
    
    // set the container's clipping so anything outside won't show up
    // TODO: verify this clipping doesn't reduce performance!
    this.$main.css( 'clip', 'rect(0px,' + width + 'px,' + height + 'px,0px)' );
    
    this.sceneBounds = new Bounds2( 0, 0, width, height );
  };
  
  Scene.prototype.resize = function( width, height ) {
    this.setSize( width, height );
    this.rebuildLayers(); // TODO: why?
  };
  
  Scene.prototype.getSceneWidth = function() {
    return this.sceneBounds.getWidth();
  };
  
  Scene.prototype.getSceneHeight = function() {
    return this.sceneBounds.getHeight();
  };
  
  Scene.prototype.updateCursor = function() {
    if ( this.input && this.input.mouse.point ) {
      var mouseTrail = this.trailUnderPoint( this.input.mouse.point );
      
      if ( mouseTrail ) {
        for ( var i = mouseTrail.length - 1; i >= 0; i-- ) {
          var cursor = mouseTrail.nodes[i].getCursor();
          
          if ( cursor ) {
            this.setSceneCursor( cursor );
            return;
          }
        }
      }
    }
    
    // fallback case
    this.setSceneCursor( this.defaultCursor );
  };
  
  Scene.prototype.setSceneCursor = function( cursor ) {
    if ( cursor !== this.lastCursor ) {
      this.lastCursor = cursor;
      this.$main.css( 'cursor', cursor );
    }
  };
  
  Scene.prototype.updateOnRequestAnimationFrame = function( element ) {
    var scene = this;
    (function step() {
      window.requestAnimationFrame( step, element );
      scene.updateScene();
    })();
  };
  
  Scene.prototype.initializeStandaloneEvents = function( parameters ) {
    // TODO extract similarity between standalone and fullscreen!
    var element = this.$main[0];
    this.initializeEvents( _.extend( {}, {
      listenerTarget: element,
      pointFromEvent: function( evt ) {
        var mainBounds = element.getBoundingClientRect();
        return new Vector2( evt.clientX - mainBounds.left, evt.clientY - mainBounds.top );
      }
    }, parameters ) );
  };
  
  Scene.prototype.initializeFullscreenEvents = function( parameters ) {
    var element = this.$main[0];
    this.initializeEvents( _.extend( {}, {
      listenerTarget: document,
      pointFromEvent: function( evt ) {
        var mainBounds = element.getBoundingClientRect();
        return new Vector2( evt.clientX - mainBounds.left, evt.clientY - mainBounds.top );
      }
    }, parameters ) );
  };
  
  Scene.prototype.initializeEvents = function( parameters ) {
    var scene = this;
    
    if ( scene.input ) {
      throw new Error( 'Attempt to attach events twice to the scene' );
    }
    
    // TODO: come up with more parameter names that have the same string length, so it looks creepier
    var pointFromEvent = parameters.pointFromEvent;
    var listenerTarget = parameters.listenerTarget;
    
    var input = new scenery.Input( scene, listenerTarget );
    scene.input = input;
    
    // maps the current MS pointer types onto the pointer spec
    function msPointerType( evt ) {
      if ( evt.pointerType === window.MSPointerEvent.MSPOINTER_TYPE_TOUCH ) {
        return 'touch';
      } else if ( evt.pointerType === window.MSPointerEvent.MSPOINTER_TYPE_PEN ) {
        return 'pen';
      } else if ( evt.pointerType === window.MSPointerEvent.MSPOINTER_TYPE_MOUSE ) {
        return 'mouse';
      } else {
        return evt.pointerType; // hope for the best
      }
    }
    
    function forEachChangedTouch( evt, callback ) {
      for ( var i = 0; i < evt.changedTouches.length; i++ ) {
        // according to spec (http://www.w3.org/TR/touch-events/), this is not an Array, but a TouchList
        var touch = evt.changedTouches.item( i );
        
        callback( touch.identifier, pointFromEvent( touch ) );
      }
    }
    
    // TODO: massive boilerplate reduction! closures should help tons!

    var implementsPointerEvents = window.navigator && window.navigator.pointerEnabled; // W3C spec for pointer events
    var implementsMSPointerEvents = window.navigator && window.navigator.msPointerEnabled; // MS spec for pointer event
    if ( this.enablePointerEvents && implementsPointerEvents ) {
      // accepts pointer events corresponding to the spec at http://www.w3.org/TR/pointerevents/
      input.addListener( 'pointerdown', function( domEvent ) {
        input.pointerDown( domEvent.pointerId, domEvent.pointerType, pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'pointerup', function( domEvent ) {
        input.pointerUp( domEvent.pointerId, domEvent.pointerType, pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'pointermove', function( domEvent ) {
        input.pointerMove( domEvent.pointerId, domEvent.pointerType, pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'pointerover', function( domEvent ) {
        input.pointerOver( domEvent.pointerId, domEvent.pointerType, pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'pointerout', function( domEvent ) {
        input.pointerOut( domEvent.pointerId, domEvent.pointerType, pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'pointercancel', function( domEvent ) {
        input.pointerCancel( domEvent.pointerId, domEvent.pointerType, pointFromEvent( domEvent ), domEvent );
      } );
    } else if ( this.enablePointerEvents && implementsMSPointerEvents ) {
      input.addListener( 'MSPointerDown', function( domEvent ) {
        input.pointerDown( domEvent.pointerId, msPointerType( domEvent ), pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'MSPointerUp', function( domEvent ) {
        input.pointerUp( domEvent.pointerId, msPointerType( domEvent ), pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'MSPointerMove', function( domEvent ) {
        input.pointerMove( domEvent.pointerId, msPointerType( domEvent ), pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'MSPointerOver', function( domEvent ) {
        input.pointerOver( domEvent.pointerId, msPointerType( domEvent ), pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'MSPointerOut', function( domEvent ) {
        input.pointerOut( domEvent.pointerId, msPointerType( domEvent ), pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'MSPointerCancel', function( domEvent ) {
        input.pointerCancel( domEvent.pointerId, msPointerType( domEvent ), pointFromEvent( domEvent ), domEvent );
      } );
    } else {
      input.addListener( 'mousedown', function( domEvent ) {
        input.mouseDown( pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'mouseup', function( domEvent ) {
        input.mouseUp( pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'mousemove', function( domEvent ) {
        input.mouseMove( pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'mouseover', function( domEvent ) {
        input.mouseOver( pointFromEvent( domEvent ), domEvent );
      } );
      input.addListener( 'mouseout', function( domEvent ) {
        input.mouseOut( pointFromEvent( domEvent ), domEvent );
      } );
      
      input.addListener( 'touchstart', function( domEvent ) {
        forEachChangedTouch( domEvent, function( id, point ) {
          input.touchStart( id, point, domEvent );
        } );
      } );
      input.addListener( 'touchend', function( domEvent ) {
        forEachChangedTouch( domEvent, function( id, point ) {
          input.touchEnd( id, point, domEvent );
        } );
      } );
      input.addListener( 'touchmove', function( domEvent ) {
        forEachChangedTouch( domEvent, function( id, point ) {
          input.touchMove( id, point, domEvent );
        } );
      } );
      input.addListener( 'touchcancel', function( domEvent ) {
        forEachChangedTouch( domEvent, function( id, point ) {
          input.touchCancel( id, point, domEvent );
        } );
      } );
    }
  };
  
  Scene.prototype.resizeOnWindowResize = function() {
    var scene = this;
    
    var resizer = function () {
      scene.resize( window.innerWidth, window.innerHeight );
    };
    $( window ).resize( resizer );
    resizer();
  };
  
  // in-depth check to make sure everything is layered properly
  Scene.prototype.layerAudit = function() {
    var scene = this;
    
    var boundaries = this.calculateBoundaries( null, null, null );
    assert && assert( boundaries.length === this.layers.length + 1, 'boundary count (' + boundaries.length + ') does not match layer count (' + this.layers.length + ') + 1' );
    
    // count how many 'self' trails there are
    var eachTrailUnderPaintedCount = 0;
    new scenery.Trail( this ).eachTrailUnder( function( trail ) {
      if ( trail.isPainted() ) {
        eachTrailUnderPaintedCount++;
        
        assert && assert( scene.trailLayerMap[trail.getUniqueId()], 'scene must map every painted trail to a layer' );
      }
    } );
    
    var layerPaintedCount = 0;
    _.each( this.layers, function( layer ) {
      layerPaintedCount += layer.getLayerTrails().length;
      
      // reindex now so we don't have problems later
      layer.startPaintedTrail.reindex();
      layer.endPaintedTrail.reindex();
    } );
    
    var layerIterationPaintedCount = 0;
    _.each( this.layers, function( layer ) {
      var selfCount = 0;
      scenery.Trail.eachPaintedTrailBetween( layer.startPaintedTrail, layer.endPaintedTrail, function( trail ) {
        selfCount++;
      }, false, scene );
      assert && assert( selfCount > 0, 'every layer must have at least one self trail' );
      layerIterationPaintedCount += selfCount;
    } );
    
    // we have a map that tracks every painted trail, so this count should match the above totals
    var trailLayerCount = 0;
    _.each( this.trailLayerMap, function() { trailLayerCount++; } );
    
    assert && assert( eachTrailUnderPaintedCount === layerPaintedCount, 'cross-referencing self trail counts: layerPaintedCount, ' + eachTrailUnderPaintedCount + ' vs ' + layerPaintedCount );
    assert && assert( eachTrailUnderPaintedCount === layerIterationPaintedCount, 'cross-referencing self trail counts: layerIterationPaintedCount, ' + eachTrailUnderPaintedCount + ' vs ' + layerIterationPaintedCount );
    assert && assert( eachTrailUnderPaintedCount === trailLayerCount, 'cross-referencing self trail counts: trailLayerCount, ' + eachTrailUnderPaintedCount + ' vs ' + trailLayerCount );
    
    _.each( this.layers, function( layer ) {
      var startTrail = layer.startPaintedTrail;
      var endTrail = layer.endPaintedTrail;
      
      assert && assert( startTrail.compare( endTrail ) <= 0, 'proper ordering on layer trails' );
    } );
    
    for ( var i = 1; i < this.layers.length; i++ ) {
      assert && assert( this.layers[0].startPaintedTrail.compare( this.layers[1].startPaintedTrail ) === -1, 'proper ordering of layers in scene.layers array' );
    }
    
    _.each( this.layers, function( layer ) {
      // a list of trails that the layer tracks
      var layerTrails = layer.getLayerTrails();
      
      // a list of trails that the layer should be tracking (between painted trails)
      var computedTrails = [];
      scenery.Trail.eachPaintedTrailBetween( layer.startPaintedTrail, layer.endPaintedTrail, function( trail ) {
        computedTrails.push( trail.copy() );
      }, false, scene );
      
      // verify that the layer has an identical record of trails compared to the trails inside its boundaries
      assert && assert( layerTrails.length === computedTrails.length, 'layer has incorrect number of tracked trails' );
      _.each( layerTrails, function( trail ) {
        assert && assert( _.some( computedTrails, function( otherTrail ) { return trail.equals( otherTrail ); } ), 'layer has a tracked trail discrepancy' );
      } );
      
      // verify that each trail has the same (or null) renderer as the layer
      scenery.Trail.eachTrailBetween( layer.startPaintedTrail, layer.endPaintedTrail, function( trail ) {
        var node = trail.lastNode();
        assert && assert( !node.renderer || node.renderer.name === layer.type.name, 'specified renderers should match the layer renderer' );
      }, false, scene );
      
      // verify layer splits
      scenery.Trail.eachTrailBetween( layer.startPaintedTrail, layer.endPaintedTrail, function( trail ) {
        var node = trail.lastNode();
        assert && assert( !node.layerSplitBefore || trail.equals( layerTrails[0] ), 'layerSplitBefore between painted trails can only be on the first trail' );
        assert && assert( !node.layerSplitAfter || trail.equals( layerTrails[layerTrails.length-1] ), 'layerSplitAfter between painted trails can only be on the last trail' );
      }, false, scene );
    } );
    
    return true; // so we can assert( layerAudit() )
  };
  
  Scene.prototype.getDebugHTML = function() {
    var startPointer = new scenery.TrailPointer( new scenery.Trail( this ), true );
    var endPointer = new scenery.TrailPointer( new scenery.Trail( this ), false );
    
    function str( ob ) {
      return ob ? ob.toString() : ob;
    }
    
    var depth = 0;
    
    var result = '';
    
    var layerEntries = [];
    _.each( this.layers, function( layer ) {
      layer.startPointer && layer.startPointer.trail && layer.startPointer.trail.reindex();
      layer.endPointer && layer.endPointer.trail && layer.endPointer.trail.reindex();
      var startIdx = str( layer.startPointer );
      var endIndex = str( layer.endPointer );
      if ( !layerEntries[startIdx] ) {
        layerEntries[startIdx] = '';
      }
      if ( !layerEntries[endIndex] ) {
        layerEntries[endIndex] = '';
      }
      layer.startPaintedTrail.reindex();
      layer.endPaintedTrail.reindex();
      var layerInfo = layer.getId() + ' <strong>' + layer.type.name + '</strong>' +
                      ' trails: ' + ( layer.startPaintedTrail ? str( layer.startPaintedTrail ) : layer.startPaintedTrail ) +
                      ',' + ( layer.endPaintedTrail ? str( layer.endPaintedTrail ) : layer.endPaintedTrail ) +
                      ' pointers: ' + str( layer.startPointer ) +
                      ',' + str( layer.endPointer );
      layerEntries[startIdx] += '<div style="color: #080">+Layer ' + layerInfo + '</div>';
      layerEntries[endIndex] += '<div style="color: #800">-Layer ' + layerInfo + '</div>';
    } );
    
    startPointer.depthFirstUntil( endPointer, function( pointer ) {
      var div;
      var ptr = str( pointer );
      var node = pointer.trail.lastNode();
      
      function addQualifier( text ) {
          div += ' <span style="color: #008">' + text + '</span>';
        }
      
      if ( layerEntries[ptr] ) {
        result += layerEntries[ptr];
      }
      if ( pointer.isBefore ) {
        div = '<div style="margin-left: ' + ( depth * 20 ) + 'px">';
        if ( node.constructor.name ) {
          div += ' ' + node.constructor.name; // see http://stackoverflow.com/questions/332422/how-do-i-get-the-name-of-an-objects-type-in-javascript
        }
        div += ' <span style="font-weight: ' + ( node.isPainted() ? 'bold' : 'normal' ) + '">' + pointer.trail.lastNode().getId() + '</span>';
        div += ' <span style="color: #888">' + str( pointer.trail ) + '</span>';
        if ( !node._visible ) {
          addQualifier( 'invisible' );
        }
        if ( !node._pickable ) {
          addQualifier( 'unpickable' );
        }
        if ( node._clipShape ) {
          addQualifier( 'clipShape' );
        }
        if ( node._renderer ) {
          addQualifier( 'renderer:' + node._renderer.name );
        }
        if ( node._rendererOptions ) {
          addQualifier( 'rendererOptions:' + _.each( node._rendererOptions, function( option, key ) { return key + ':' + str( option ); } ).join( ',' ) );
        }
        if ( node._layerSplitBefore ) {
          addQualifier( 'layerSplitBefore' );
        }
        if ( node._layerSplitAfter ) {
          addQualifier( 'layerSplitAfter' );
        }
        if ( node._opacity < 1 ) {
          addQualifier( 'opacity:' + node._opacity );
        }
        
        var transformType = '';
        switch ( node.transform.getMatrix().type ) {
          case Matrix3.Types.IDENTITY: transformType = ''; break;
          case Matrix3.Types.TRANSLATION_2D: transformType = 'translated'; break;
          case Matrix3.Types.SCALING: transformType = 'scale'; break;
          case Matrix3.Types.AFFINE: transformType = 'affine'; break;
          case Matrix3.Types.OTHER: transformType = 'other'; break;
        }
        if ( transformType ) {
          div += ' <span style="color: #88f" title="' + node.transform.getMatrix().toString().replace( '\n', '&#10;' ) + '">' + transformType + '</span>';
        }
        div += '</div>';
        result += div;
      }
      depth += pointer.isBefore ? 1 : -1;
    }, false );
    
    return result;
  };
  
  Scene.prototype.popupDebug = function() {
    var htmlContent = '<!DOCTYPE html>'+
                      '<html lang="en">'+
                      '<head><title>Scenery Debug Snapshot</title></head>'+
                      '<body>' + this.getDebugHTML() + '</body>'+
                      '</html>';
    window.open( 'data:text/html;charset=utf-8,' + encodeURIComponent( htmlContent ) );
  };
  
  Scene.prototype.getBasicConstructor = function( propLines ) {
    return 'new scenery.Scene( $( \'#main\' ), {' + propLines + '} )';
  };
  
  Scene.prototype.toStringWithChildren = function( mutateScene ) {
    var scene = this;
    var result = '';
    
    var nodes = this.getTopologicallySortedNodes().slice( 0 ).reverse(); // defensive slice, in case we store the order somewhere
    
    function name( node ) {
      return node === scene ? 'scene' : node.constructor.name.toLowerCase() + node.id;
    }
    
    _.each( nodes, function( node ) {
      if ( result ) {
        result += '\n';
      }
      
      if ( mutateScene && node === scene ) {
        var props = scene.getPropString( '  ', false );
        result += 'scene.mutate( {' + ( props ? ( '\n' + props + '\n' ) : '' ) + '} )';
      } else {
        result += 'var ' + name( node ) + ' = ' + node.toString( '', false );
      }
      
      _.each( node.children, function( child ) {
        result += '\n' + name( node ) + '.addChild( ' + name( child ) + ' );';
      } );
    } );
    
    return result;
  };
  
  Scene.enableLayerLogging = function() {
    layerLogger = function( ob ) { console.log( ob ); };
  };
  
  function applyCSSHacks( $main, options ) {
    // to use CSS3 transforms for performance, hide anything outside our bounds by default
    if ( !options.allowSceneOverflow ) {
      $main.css( 'overflow', 'hidden' );
    }
    
    // forward all pointer events
    $main.css( '-ms-touch-action', 'none' );
    
    if ( options.allowCSSHacks ) {
      // some css hacks (inspired from https://github.com/EightMedia/hammer.js/blob/master/hammer.js)
      (function() {
        var prefixes = [ '-webkit-', '-moz-', '-ms-', '-o-', '' ];
        var properties = {
          userSelect: 'none',
          touchCallout: 'none',
          touchAction: 'none',
          userDrag: 'none',
          tapHighlightColor: 'rgba(0,0,0,0)'
        };
        
        _.each( prefixes, function( prefix ) {
          _.each( properties, function( propertyValue, propertyName ) {
            $main.css( prefix + propertyName, propertyValue );
          } );
        } );
      })();
    }
  }
  
  return Scene;
} );

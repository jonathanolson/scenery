// Copyright 2002-2013, University of Colorado Boulder

/**
 * The PointerOverlay shows pointer locations in the scene.  This is useful when recording a session for interviews or when a teacher is broadcasting
 * a tablet session on an overhead projector.  See https://github.com/phetsims/scenery/issues/111
 *
 * Each pointer is rendered in a different <svg> so that CSS3 transforms can be used to make performance smooth on iPad.
 *
 * @author Sam Reid
 */

define( function( require ) {
  'use strict';

  var Bounds2 = require( 'DOT/Bounds2' );
  var Transform3 = require( 'DOT/Transform3' );
  var Matrix3 = require( 'DOT/Matrix3' );

  var scenery = require( 'SCENERY/scenery' );
  require( 'SCENERY/util/Trail' );

  var Util = require( 'SCENERY/util/Util' );

  scenery.PointerOverlay = function PointerOverlay( scene ) {
    var pointerOverlay = this;
    this.scene = scene;

    // add element to show the pointers
    this.pointerSVGContainer = document.createElement( 'div' );
    this.pointerSVGContainer.style.position = 'absolute';
    this.pointerSVGContainer.style.top = 0;
    this.pointerSVGContainer.style.left = 0;
    this.pointerSVGContainer.style['pointer-events'] = 'none';

    var innerRadius = 30;
    var strokeWidth = 10;
    var diameter = (innerRadius + strokeWidth / 2) * 2;
    var radius = diameter / 2;

    //Resize the parent div when the scene is resized
    scene.addEventListener( 'resize', function( args ) {
      pointerOverlay.pointerSVGContainer.setAttribute( 'width', args.width );
      pointerOverlay.pointerSVGContainer.setAttribute( 'height', args.height );
      pointerOverlay.pointerSVGContainer.style.clip = 'rect(0px,' + args.width + 'px,' + args.height + 'px,0px)';
    }, false );

    scene.input.pointerListener = {

      //Display a pointer that was added.  Use a separate SVG layer for each pointer so it can be hardware accelerated, otherwise it is too slow just setting svg internal attributes
      pointerAdded: function( pointer ) {

        var svg = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
        svg.style.position = 'absolute';
        svg.style.top = 0;
        svg.style.left = 0;
        svg.style['pointer-events'] = 'none';

        //Fit the size to the display
        svg.setAttribute( 'width', diameter );
        svg.setAttribute( 'height', diameter );

        var verticalLine = document.createElementNS( 'http://www.w3.org/2000/svg', 'line' );
        verticalLine.setAttribute( 'x1', radius );
        verticalLine.setAttribute( 'y1', 0 );
        verticalLine.setAttribute( 'x2', radius );
        verticalLine.setAttribute( 'y2', diameter );
        verticalLine.setAttribute( 'stroke', 'black' );
        verticalLine.setAttribute( 'stroke-width', 1 );

        var horizontalLine = document.createElementNS( 'http://www.w3.org/2000/svg', 'line' );
        horizontalLine.setAttribute( 'x1', 0 );
        horizontalLine.setAttribute( 'y1', radius );
        horizontalLine.setAttribute( 'x2', diameter );
        horizontalLine.setAttribute( 'y2', radius );
        horizontalLine.setAttribute( 'stroke', 'black' );
        horizontalLine.setAttribute( 'stroke-width', 1 );

        var circle = document.createElementNS( 'http://www.w3.org/2000/svg', 'circle' );

        //use css transform for performance?
        circle.setAttribute( 'cx', innerRadius + strokeWidth / 2 );
        circle.setAttribute( 'cy', innerRadius + strokeWidth / 2 );
        circle.setAttribute( 'r', innerRadius );
        circle.setAttribute( 'style', 'stroke:cyan; stroke-width:10; fill:none;' );

        // If there is no point, show the pointer way off screen so that it isn't visible to the user.
        //TODO: remove the need for this workaround
        if ( pointer.point === null ) {

          pointer.point = { x: -10000, y: -1000 };
        }

        //Add a move listener to the pointer to update position when it has moved
        var pointerRemoved = function() {

          //For touches that get a touch up event, remove them.  But when the mouse button is released, don't stop showing the mouse location
          if ( pointer.isTouch ) {
            pointerOverlay.pointerSVGContainer.removeChild( svg );
            pointer.removeInputListener( moveListener );
          }
        };
        var moveListener = {
          move: function() {

            //TODO: this allocates memory when pointers are dragging, perhaps rewrite to remove allocations
            Util.applyCSSTransform( Matrix3.translation( pointer.point.x - radius, pointer.point.y - radius ), svg );
          },

          up: pointerRemoved,
          cancel: pointerRemoved
        };
        pointer.addInputListener( moveListener );

        moveListener.move();
        svg.appendChild( verticalLine );
        svg.appendChild( horizontalLine );
        svg.appendChild( circle );
        pointerOverlay.pointerSVGContainer.appendChild( svg );
      }
    };

    //if there is a mouse, add it here
    if ( scene.input && scene.input.mouse ) {
      scene.input.pointerListener.pointerAdded( scene.input.mouse );
    }

    scene.reindexLayers();
    scene.$main[0].appendChild( this.pointerSVGContainer );
  };
  var PointerOverlay = scenery.PointerOverlay;

  PointerOverlay.prototype = {
    dispose: function() {
      this.scene.$main[0].removeChild( this.pointerSVGContainer );
      delete this.scene.input.pointerListener;
    },

    setZIndex: function( index ) {
      this.pointerSVGContainer.style.zIndex = index;//Make sure it is in front of enough other things!
    }
  };

  return PointerOverlay;
} );
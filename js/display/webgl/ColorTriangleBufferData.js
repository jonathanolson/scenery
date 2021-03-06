//  Copyright 2002-2014, University of Colorado Boulder

/**
 * This WebGL renderer is used to draw colored triangles.  Vertices are allocated for geometry + colors, and can be updated
 * dynamically.
 * TODO: Can this same pattern be used for interleaved texture coordinates? (Or other interleaved data?)
 * TODO: Work in progress, much to be done here!
 * TODO: Add this file to the list of scenery files (for jshint, etc.)
 *
 * @author Sam Reid (PhET Interactive Simulations)
 */
define( function( require ) {
  'use strict';

  // modules
  var inherit = require( 'PHET_CORE/inherit' );
  var Color = require( 'SCENERY/util/Color' );
  var Matrix4 = require( 'DOT/Matrix4' );

  /**
   * @constructor
   */
  function ColorTriangleBufferData() {

    //TODO: Preallocate a large array so that bufferData only needs to be called once?
    this.vertexArray = []; //x,y,z,r,g,b,a,m11,m13,m13,m21,m22,m23
    this.elementsPerVertex = 13;
  }

  return inherit( Object, ColorTriangleBufferData, {
    reserveVertices: function( numVertices ) {
      var startIndex = this.vertexArray.length;
      for ( var i = 0; i < numVertices; i++ ) {
        for ( var k = 0; k < this.elementsPerVertex; k++ ) {
          this.vertexArray.push( 0 );
        }
      }
      var endIndex = this.vertexArray.length;
      return { startIndex: startIndex, endIndex: endIndex };
    },
    /**
     * Add geometry and color for a scenery path using sampling + triangulation.
     * Uses poly2tri for triangulation
     * @param path
     */
    createFromPath: function( path, z ) {
      assert && assert( z !== undefined );

      var matrix4 = path.getLocalToGlobalMatrix().toMatrix4();
      var shape = path.shape;
      var color = new Color( path.fill );
      var linear = shape.toPiecewiseLinear( {} );
      var subpaths = linear.subpaths;

      // Output to a string for ease of debugging within http://r3mi.github.io/poly2tri.js/
      var string = '';

      // Output the contour to an array of poly2tri.Point
      var contour = [];

      var k;
      for ( var i = 0; i < subpaths.length; i++ ) {
        var subpath = subpaths[ i ];
        for ( k = 0; k < subpath.points.length; k++ ) {

          string = string + '' + subpath.points[ k ].x + ' ' + subpath.points[ k ].y + '\n';

          //Add the points into the contour, but don't duplicate the last point.
          //TODO: how to handle closed vs open shapes
          if ( k < subpath.points.length - 1 ) {
            contour.push( new poly2tri.Point( subpath.points[ k ].x, subpath.points[ k ].y ) );
          }
        }
      }

      // Triangulate using poly2tri
      // Circle linearization is creating some duplicated points, so bail on those for now.
      var triangles;
      try {
        triangles = new poly2tri.SweepContext( contour ).triangulate().getTriangles();
      }
      catch( error ) {
        console.log( 'error in triangulation', error );
        triangles = [];
      }

      // Add the triangulated geometry into the array buffer.
      for ( k = 0; k < triangles.length; k++ ) {
        var triangle = triangles[ k ];
        for ( var zz = 0; zz < triangle.points_.length; zz++ ) {
          var pt = triangle.points_[ zz ];

          // Mutate the vertices a bit to see what is going on.  Or not.
          var randFactor = 0;
          this.vertexArray.push( pt.x + Math.random() * randFactor, pt.y + Math.random() * randFactor, z,
            color.red / 255, color.green / 255, color.blue / 255, color.alpha,
            matrix4.m00(), matrix4.m01(), matrix4.m03(), matrix4.m10(), matrix4.m11(), matrix4.m13()
          );
        }
      }
    },
    createFromTriangle: function( x1, y1, x2, y2, x3, y3, color, z, matrix4 ) {
      assert && assert( z !== undefined );

      matrix4 = matrix4 || Matrix4.identity();
      color = new Color( color );
      var r = color.red / 255;
      var g = color.green / 255;
      var b = color.blue / 255;
      var a = color.alpha;

      var colorTriangleBufferData = this;
      var index = this.vertexArray.length;
      colorTriangleBufferData.vertexArray.push(
        // Top left
        x1, y1, z, r, g, b, a, matrix4.m00(), matrix4.m01(), matrix4.m03(), matrix4.m10(), matrix4.m11(), matrix4.m13(),
        x2, y2, z, r, g, b, a, matrix4.m00(), matrix4.m01(), matrix4.m03(), matrix4.m10(), matrix4.m11(), matrix4.m13(),
        x3, y3, z, r, g, b, a, matrix4.m00(), matrix4.m01(), matrix4.m03(), matrix4.m10(), matrix4.m11(), matrix4.m13()
      );

      //Track the index so it can delete itself, update itself, etc.
      //TODO: Move to a separate class.
      return {
        startIndex: index,
        endIndex: colorTriangleBufferData.vertexArray.length,
        setTriangle: function( x1, y1, x2, y2, x3, y3 ) {
          colorTriangleBufferData.vertexArray[ index + 0 + 13 * 0 ] = x1;
          colorTriangleBufferData.vertexArray[ index + 1 + 13 * 0 ] = y1;
          colorTriangleBufferData.vertexArray[ index + 0 + 13 * 1 ] = x2;
          colorTriangleBufferData.vertexArray[ index + 1 + 13 * 1 ] = y2;
          colorTriangleBufferData.vertexArray[ index + 0 + 13 * 2 ] = x3;
          colorTriangleBufferData.vertexArray[ index + 1 + 13 * 2 ] = y3;
        },
        setZ: function( z ) {
          colorTriangleBufferData.vertexArray[ index + 2 ] = z;
          colorTriangleBufferData.vertexArray[ index + 5 ] = z;
          colorTriangleBufferData.vertexArray[ index + 8 ] = z;
        }
      };
    },

    createStar: function( _x, _y, _innerRadius, _outerRadius, _totalAngle, r, g, b, a, z ) {
      assert && assert( z !== undefined );

      var colorTriangleBufferData = this;
      var index = this.vertexArray.length;
      for ( var i = 0; i < 18; i++ ) {
        this.vertexArray.push( 0 );
      }

      // Add the same color for all vertices (solid fill star).
      // TODO: some way to reduce this amount of elements!
//      this.colors.push(
//        r, g, b, a,
//        r, g, b, a,
//        r, g, b, a,
//
//        r, g, b, a,
//        r, g, b, a,
//        r, g, b, a,
//
//        r, g, b, a,
//        r, g, b, a,
//        r, g, b, a
//      );

      //Track the index so it can delete itself, update itself, etc.
      var myStar = {
        startIndex: index,
        setStar: function( _x, _y, _innerRadius, _outerRadius, _totalAngle ) {

          var points = [];
          //Create the points for a filled-in star, which will be used to compute the geometry of a partial star.
          for ( i = 0; i < 10; i++ ) {

            //Start at the top and proceed clockwise
            var angle = i / 10 * Math.PI * 2 - Math.PI / 2 + _totalAngle;
            var radius = i % 2 === 0 ? _outerRadius : _innerRadius;
            var x = radius * Math.cos( angle ) + _x;
            var y = radius * Math.sin( angle ) + _y;
            points.push( { x: x, y: y } );
          }

          var index = this.index;
          colorTriangleBufferData.vertexArray[ index + 0 ] = points[ 0 ].x;
          colorTriangleBufferData.vertexArray[ index + 1 ] = points[ 0 ].y;
          colorTriangleBufferData.vertexArray[ index + 2 ] = points[ 3 ].x;
          colorTriangleBufferData.vertexArray[ index + 3 ] = points[ 3 ].y;
          colorTriangleBufferData.vertexArray[ index + 4 ] = points[ 6 ].x;
          colorTriangleBufferData.vertexArray[ index + 5 ] = points[ 6 ].y;

          colorTriangleBufferData.vertexArray[ index + 6 ] = points[ 8 ].x;
          colorTriangleBufferData.vertexArray[ index + 7 ] = points[ 8 ].y;
          colorTriangleBufferData.vertexArray[ index + 8 ] = points[ 2 ].x;
          colorTriangleBufferData.vertexArray[ index + 9 ] = points[ 2 ].y;
          colorTriangleBufferData.vertexArray[ index + 10 ] = points[ 5 ].x;
          colorTriangleBufferData.vertexArray[ index + 11 ] = points[ 5 ].y;

          colorTriangleBufferData.vertexArray[ index + 12 ] = points[ 0 ].x;
          colorTriangleBufferData.vertexArray[ index + 13 ] = points[ 0 ].y;
          colorTriangleBufferData.vertexArray[ index + 14 ] = points[ 7 ].x;
          colorTriangleBufferData.vertexArray[ index + 15 ] = points[ 7 ].y;
          colorTriangleBufferData.vertexArray[ index + 16 ] = points[ 4 ].x;
          colorTriangleBufferData.vertexArray[ index + 17 ] = points[ 4 ].y;
        }
      };
      myStar.setStar( _x, _y, _innerRadius, _outerRadius, _totalAngle );
      return myStar;
    },
    dispose: function( handle ) {
      //TODO: Dispose it!
    }
  } );
} );
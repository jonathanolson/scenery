// Copyright 2002-2012, University of Colorado

/**
 * Module that includes all Scenery dependencies, so that requiring this module will return an object
 * that consists of the entire exported 'scenery' namespace API.
 *
 * The API is actually generated by the 'scenery' module, so if this module (or all other modules) are
 * not included, the 'scenery' namespace may not be complete.
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( [
    'SCENERY/debug/DebugContext',
    
    'SCENERY/input/Event',
    'SCENERY/input/Finger',
    'SCENERY/input/Input',
    'SCENERY/input/Key',
    'SCENERY/input/Mouse',
    'SCENERY/input/SimpleDragHandler',
    'SCENERY/input/Touch',
    
    'SCENERY/layers/Backend',
    'SCENERY/layers/CanvasLayer',
    'SCENERY/layers/DOMLayer',
    'SCENERY/layers/Layer',
    'SCENERY/layers/LayerState',
    'SCENERY/layers/LayerStrategy',
    'SCENERY/layers/LayerType',
    'SCENERY/layers/SVGLayer',
    
    'SCENERY/nodes/DOM',
    'SCENERY/nodes/Fillable',
    'SCENERY/nodes/Image',
    'SCENERY/nodes/Path',
    'SCENERY/nodes/Strokable',
    'SCENERY/nodes/Text',
    
    'SCENERY/util/Color',
    'SCENERY/util/Font',
    'SCENERY/util/Util',
    
    'SCENERY/Node',
    'SCENERY/RenderState',
    'SCENERY/Scene',
    'SCENERY/Shape',
    'SCENERY/Trail',
    'SCENERY/TrailPointer',
    'SCENERY/scenery'
  ], function(
    Backend,
    CanvasLayer,
    Color,
    DebugContext,
    DOM,
    DOMLayer,
    Event,
    Fillable,
    Finger,
    Font,
    Image,
    Input,
    Key,
    Layer,
    LayerState,
    LayerStrategy,
    LayerType,
    Mouse,
    Node,
    Path,
    RenderState,
    Scene,
    Shape,
    SimpleDragHandler,
    Strokable,
    SVGLayer,
    Text,
    Touch,
    Trail,
    TrailPointer,
    Util,
    scenery
  ) {
  
  return scenery;
} );

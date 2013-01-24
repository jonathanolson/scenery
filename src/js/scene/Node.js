// Copyright 2002-2012, University of Colorado

/**
 * A node for the phet-scene scene graph. Supports only tree-style graphs at the moment.
 * Handles multiple layers with assorted types (canvas, svg, DOM, etc.), and bounds
 * computation
 *
 * TODO: investigate handling DAGs (directed acyclic graphs)
 *
 * @author Jonathan Olson
 */

var phet = phet || {};
phet.scene = phet.scene || {};

(function(){
    "use strict";
    
    var Bounds2 = phet.math.Bounds2;
    var Shape = phet.scene.Shape;
    
    // TODO: consider an args-style constructor here!
    phet.scene.Node = function() {
        // TODO: hide as _visible, add setter/getter
        this.visible = true;
        
        // type of layer to be created for content under this node.
        // if non-null, this node is a layer root, and layerType should be a layer constructor function
        this._layerType = null;
        
        // This node and all children will be clipped by this shape (in addition to any other clipping shapes).
        // The shape should be in the local coordinate frame
        this.clipShape = null;
        
        this.children = [];
        this.transform = new phet.math.Transform3();
        this.parent = null;
        this._isRoot = false;
        
        // TODO: add getter/setters that will be able to invalidate whether this node is under any fingers, etc.
        this._includeStrokeInHitRegion = false;
        
        // layer-specific data, currently updated in the rebuildLayers step
        this._layerBeforeRender = null; // layer to swap to before rendering this node
        this._layerAfterRender = null; // layer to swap to after rendering this node
        this._layerReference = null; // stores a reference to this node's corresponding layer (the one used to render it's self content)
        this._hasLayerBelow = false; // whether any descendants are also layer roots
        
        // bounds handling
        this._bounds = Bounds2.NOTHING; // for this node and its children, in "parent" coordinates
        this._selfBounds = Bounds2.NOTHING; // just for this node, in "local" coordinates
        this._childBounds = Bounds2.NOTHING; // just for children, in "local" coordinates
        this._boundsDirty = true;
        this._selfBoundsDirty = true;
        this._childBoundsDirty = true;
        
        // dirty region handling
        this._paintDirty = false;
        this._childPaintDirty = false;
        this._oldPaintMarked = false; // flag indicates the last rendered bounds of this node and all descendants are marked for a repaint already
        
        // shape used for rendering
        this._shape = null;
        // fill/stroke for shapes
        this._stroke = null;
        this._fill = null;
        
        this._lineDrawingStyles = new Shape.LineStyles();
    }
    
    var Node = phet.scene.Node;
    var Matrix3 = phet.math.Matrix3;
    
    Node.prototype = {
        constructor: Node,
        
        // override to render typical leaf behavior (although possible to use for non-leaf nodes also)
        renderSelf: function ( state ) {
            // by default, render a shape if it exists
            if( this.hasShape() ) {
                if( state.isCanvasState() ) {
                    var layer = state.layer;
                    var context = layer.context;
                    
                    // TODO: fill/stroke delay optimizations?
                    context.beginPath();
                    this._shape.writeToContext( context );
                    
                    if( this._fill ) {
                        layer.setFillStyle( this._fill );
                        context.fill();
                    }
                    if( this._stroke ) {
                        layer.setStrokeStyle( this._stroke );
                        layer.setLineWidth( this.getLineWidth() );
                        layer.setLineCap( this.getLineCap() );
                        layer.setLineJoin( this.getLineJoin() );
                        context.stroke();
                    }
                } else {
                    throw new Error( 'layer type shape rendering not implemented' );
                }
            }
        },
        
        enterState: function( state ) {
            // switch layers if needed
            if( this._layerBeforeRender ) {
                state.switchToLayer( this._layerBeforeRender );
            }
            
            // apply this node's transform
            if ( !this.transform.isIdentity() ) {
                // TODO: consider a stack-based model for transforms?
                state.applyTransformationMatrix( this.transform.getMatrix() );
            }
            
            if( this.clipShape ) {
                state.pushClipShape( this.clipShape );
            }
        },
        
        exitState: function( state ) {
            if( this.clipShape ) {
                state.popClipShape();
            }
            
            // apply the inverse of this node's transform
            if ( !this.transform.isIdentity() ) {
                state.applyTransformationMatrix( this.transform.getInverse() );
            }
            
            // switch layers if needed
            if( this._layerAfterRender ) {
                state.switchToLayer( this._layerAfterRender );
            }
        },
        
        insertChild: function( node, index ) {
            phet.assert( node !== null && node !== undefined );
            if ( this.isChild( node ) ) {
                return;
            }
            if ( node.parent !== null ) {
                node.parent.removeChild( node );
            }
            node.parent = this;
            this.children.splice( index, 0, node );
            
            node.invalidateBounds();
            node.invalidatePaint();
            
            // keep _hasLayerBelow consistent
            if( node._hasLayerBelow || node.isLayerRoot() ) {
                var ancestor = this;
                while( ancestor != null && !ancestor._hasLayerBelow ) {
                    ancestor._hasLayerBelow = true;
                    ancestor = ancestor.parent;
                }
                
                this.markLayerRefreshNeeded();
            }
            
            if( this._hasLayerBelow ) {
                // TODO: if we don't automatically construct "valley" layers in refreshLayers, add this back in. other cases are handled above
                //this.markLayerRefreshNeeded();
            } else {
                // no layer changes are necessary, however we need to synchronize layer references in the new subtree if applicable
                if( this.isRooted() && node._layerReference != this._layerReference ) {
                    var layerReference = this._layerReference;
                    node.walkDepthFirst( function( child ) {
                        child._layerReference = layerReference;
                    } );
                }
            }
        },
        
        addChild: function( node ) {
            this.insertChild( node, this.children.length );
        },
        
        removeChild: function ( node ) {
            phet.assert( this.isChild( node ) );
            
            node.markOldPaint();
            
            node.parent = null;
            this.children.splice( this.children.indexOf( node ), 1 );
            
            this.invalidateBounds();
            
            // keep _hasLayerBelow consistent
            if( node._hasLayerBelow || node.isLayerRoot() ) {
                
                // walk up the tree removing _hasLayerBelow flags until one is still set
                var ancestor = this;
                while( ancestor != null ) {
                    ancestor._hasLayerBelow = _.some( ancestor.children, function( child ) { return child._hasLayerBelow; } );
                    if( ancestor._hasLayerBelow ) {
                        break;
                    }
                }
                
                this.markLayerRefreshNeeded();
            }
        },
        
        // set to null to remove a layer type
        setLayerType: function( layerType ) {
            if( this._layerType != layerType ) {
                this._layerType = layerType;
                
                // keep _hasLayerBelow consistent
                var node = this.parent;
                while( node != null ) {
                    node._hasLayerBelow = true;
                    node = node.parent;
                }
                
                this.markLayerRefreshNeeded();
            }
        },
        
        // remove this node from its parent
        detach: function () {
            if ( this.hasParent() ) {
                this.parent.removeChild( this );
            }
        },
        
        // ensure that cached bounds stored on this node (and all children) are accurate
        validateBounds: function() {
            if( this._selfBoundsDirty ) {
                this._selfBoundsDirty = false;
                
                // if our self bounds changed, make sure to paint the area where our new bounds are
                this.markDirtyRegion( this._selfBounds );
            }
            
            // validate bounds of children if necessary
            if( this._childBoundsDirty ) {
                // have each child validate their own bounds
                _.each( this.children, function( child ) {
                    child.validateBounds();
                } );
                
                // and recompute our _childBounds
                this._childBounds = Bounds2.NOTHING;
                var that = this;
                _.each( this.children, function( child ) {
                    that._childBounds = that._childBounds.union( child._bounds );
                } );
                
                this._childBoundsDirty = false;
            }
            
            // TODO: layout here?
            
            if( this._boundsDirty ) {
                var oldBounds = this._bounds;
                
                var that = this;
                
                var newBounds = this.localToParentBounds( this._selfBounds ).union( that.localToParentBounds( this._childBounds ) );
                
                if( !newBounds.equals( oldBounds ) ) {
                    this._bounds = newBounds;
                    
                    if( this.parent != null ) {
                        this.parent.invalidateBounds();
                    }
                    // this.markDirtyRegion( this.parentToLocalBounds( oldBounds ) );
                    
                    // TODO: fire off event listeners?
                }
                
                this._boundsDirty = false;
            }
        },
        
        validatePaint: function() {
            // if dirty, mark the region
            if( this._paintDirty ) {
                this.markDirtyRegion( this.parentToLocalBounds( this._bounds ) );
                this._paintDirty = false;
            }
            
            // clear flags and recurse
            if( this._childPaintDirty || this._oldPaintMarked ) {
                this._childPaintDirty = false;
                this._oldPaintMarked = false;
                
                _.each( this.children, function( child ) {
                    child.validatePaint();
                } );
            }
        },
        
        // mark the bounds of this node as invalid, so it is recomputed before it is accessed again
        invalidateBounds: function() {
            this._boundsDirty = true;
            
            // and set flags for all ancestors
            var node = this.parent;
            while( node != null && !node._childBoundsDirty ) {
                node._childBoundsDirty = true;
                node = node.parent;
            }
        },
        
        // mark the paint of this node as invalid, so its new region will be painted
        invalidatePaint: function() {
            this._paintDirty = true;
            
            // and set flags for all ancestors (but bail if already marked, since this guarantees lower nodes will be marked)
            var node = this.parent;
            while( node != null && !node._childPaintDirty ) {
                node._childPaintDirty = true;
                node = node.parent;
            }
        },
        
        // called to notify that renderSelf will display different paint, with possibly different bounds
        invalidateSelf: function( newBounds ) {
            phet.assert( !isNaN( newBounds.x() ) );
            
            // mark the old region to be repainted, regardless of whether the actual bounds change
            this.markOldSelfPaint();
            
            // if these bounds are different than current self bounds
            if( !this._selfBounds.equals( newBounds ) ) {
                // set repaint flags
                this._selfBoundsDirty = true;
                this.invalidateBounds();
                
                // record the new bounds
                this._selfBounds = newBounds;
            }
            
            this.invalidatePaint();
        },
        
        invalidateShape: function() {
            this.markOldSelfPaint();
            
            if( this.hasShape() ) {
                this.invalidateSelf( this._shape.computeBounds( this._stroke ? this._lineDrawingStyles : null ) );
                this.invalidatePaint();
            }
        },
        
        // TODO: how to handle point vs x,y
        translate: function( x, y ) {
            // mark old bounds as needing a repaint
            this.appendMatrix( Matrix3.translation( x, y ) );
        },
        
        // scale( s ) is also supported
        scale: function( x, y ) {
            this.appendMatrix( Matrix3.scaling( x, y ) );
        },
        
        rotate: function( angle ) {
            this.appendMatrix( Matrix3.rotation2( angle ) );
        },
        
        // TODO: how to handle x,y?
        setTranslation: function( x, y ) {
            var translation = this.getTranslation();
            this.translate( x - translation.x, y - translation.y );
        },
        
        // append a transformation matrix to our local transform
        appendMatrix: function( matrix ) {
            // invalidate paint TODO improve methods for this
            this.markOldPaint();
            
            this.transform.append( matrix );
            
            this.invalidateBounds();
            this.invalidatePaint();
        },
        
        // sets the shape drawn, or null to remove the shape
        setShape: function( shape ) {
            if( this._shape != shape ) {
                this._shape = shape;
                this.invalidateShape();
            }
        },
        
        getShape: function() {
            return this._shape;
        },
        
        getLineWidth: function() {
            return this._lineDrawingStyles.lineWidth;
        },
        
        setLineWidth: function( lineWidth ) {
            if( this.getLineWidth() != lineWidth ) {
                this.markOldSelfPaint(); // since the previous line width may have been wider
                
                this._lineDrawingStyles.lineWidth = lineWidth;
                
                this.invalidateShape();
            }
        },
        
        getLineCap: function() {
            return this._lineDrawingStyles.lineCap;
        },
        
        setLineCap: function( lineCap ) {
            if( this._lineDrawingStyles.lineCap != lineCap ) {
                this.markOldSelfPaint();
                
                this._lineDrawingStyles.lineCap = lineCap;
                
                this.invalidateShape();
            }
        },
        
        getLineJoin: function() {
            return this._lineDrawingStyles.lineJoin;
        },
        
        setLineJoin: function( lineJoin ) {
            if( this._lineDrawingStyles.lineJoin != lineJoin ) {
                this.markOldSelfPaint();
                
                this._lineDrawingStyles.lineJoin = lineJoin;
                
                this.invalidateShape();
            }
        },
        
        setLineStyles: function( lineStyles ) {
            // TODO: since we have been using lineStyles as mutable for now, lack of change check is good here?
            this.markOldSelfPaint();
            
            this._lineDrawingStyles = lineStyles;
            this.invalidateShape();
        },
        
        getLineStyles: function() {
            return this._lineDrawingStyles;
        },
        
        getFill: function() {
            return this._fill;
        },
        
        setFill: function( fill ) {
            if( this.getFill() != fill ) {
                this._fill = fill;
                this.invalidatePaint();
            }
        },
        
        getStroke: function() {
            return this._stroke;
        },
        
        setStroke: function( stroke ) {
            if( this.getStroke() != stroke ) {
                // since this can actually change the bounds, we need to handle a few things differently than the fill
                this.markOldSelfPaint();
                
                this._stroke = stroke;
                this.invalidateShape();
            }
        },
        
        // bounds assumed to be in the local coordinate frame, below this node's transform
        markDirtyRegion: function( bounds ) {
            var globalBounds = this.localToGlobalBounds( bounds );
            _.each( this.findDescendantLayers(), function( layer ) {
                layer.markDirtyRegion( globalBounds );
            } );
        },
        
        markOldSelfPaint: function() {
            this.markOldPaint( true );
        },
        
        markLayerRefreshNeeded: function() {
            if( this.isRooted() ) {
                this.getScene().layersDirtyUnder( this );
            }
        },
        
        // marks the last-rendered bounds of this node and optionally all of its descendants as needing a repaint
        markOldPaint: function( justSelf ) {
            var node = this;
            var alreadyMarked = this._oldPaintMarked;
            while( !alreadyMarked && node.parent != null ) {
                node = node.parent;
                alreadyMarked = node._oldPaintMarked; 
            }
            
            // we want to not do this marking if possible multiple times for the same sub-tree, so we check flags first
            if( !alreadyMarked ) {
                if( justSelf ) {
                    this.markDirtyRegion( this._selfBounds );
                } else {
                    this.markDirtyRegion( this.parentToLocalBounds( this._bounds ) );
                    this._oldPaintMarked = true; // don't mark this in self calls, because we don't use the full bounds
                }
            }
        },
        
        isChild: function ( potentialChild ) {
            phet.assert( (potentialChild.parent === this ) === (this.children.indexOf( potentialChild ) != -1) );
            return potentialChild.parent === this;
        },
        
        // does this node have an associated layerType (are the contents of this node rendered separately from its ancestors)
        isLayerRoot: function() {
            return this._layerType != null;
        },
        
        // the first layer associated with this node (can be multiple layers if children of this node are also layer roots)
        getLayer: function() {
            phet.assert( this.isLayerRoot() );
            return this._layerBeforeRender;
        },
        
        // the bounds for content in renderSelf(), in "local" coordinates
        getSelfBounds: function() {
            return this._selfBounds;
        },
        
        // the bounds for content in render(), in "parent" coordinates
        getBounds: function() {
            this.validateBounds();
            return this._bounds;
        },
        
        // find the layer to which this node will be rendered
        findLayer: function() {
            return this._layerReference;
        },
        
        // find all layers for which this node (and all its descendants) will be rendered
        findDescendantLayers: function() {
            var firstLayer = this.findLayer();
            
            if( firstLayer == null ) {
                return [];
            }
            
            // run a node out to the last child until we reach a leaf, to find the last layer we will render to in this subtree
            var node = this;
            while( node.children.length != 0 ) {
                node = _.last( node.children );
            }
            var lastLayer = node.findLayer();
            
            // collect all layers between the first and last layers
            var layers = [firstLayer];
            var layer = firstLayer;
            while( layer != lastLayer && layer.nextLayer != null ) {
                layer = layer.nextLayer;
                layers.push( layer );
            }
            return layers;
        },
        
        // returns the ancestor node of this node that has no parent
        getBaseNode: function() {
            if( this.parent ) {
                return this.parent.getBaseNode();
            } else {
                return this;
            }
        },
        
        isRoot: function() {
            return this._isRoot;
        },
        
        // returns true if this node is a descendant of a scene root
        isRooted: function() {
            return this.getBaseNode().isRoot();
        },
        
        // either undefined (if not rooted), or the scene it is attached to
        getScene: function() {
            return this.getBaseNode().scene;
        },
        
        // checking for whether a point (in parent coordinates) is contained in this sub-tree
        containsPoint: function( point ) {
            // update bounds for pruning
            this.validateBounds();
            
            // bail quickly if this doesn't hit our computed bounds
            if( !this._bounds.containsPoint( point ) ) { return false; }
            
            // point in the local coordinate frame. computed after the main bounds check, so we can bail out there efficiently
            var localPoint = this.transform.inversePosition2( point );
            
            // check children first, since they are rendered later
            if( this.children.length > 0 && this._childBounds.containsPoint( localPoint ) ) {
                
                // manual iteration here so we can return directly, and so we can iterate backwards (last node is in front)
                for( var i = this.children.length - 1; i >= 0; i-- ) {
                    var child = this.children[i];
                    
                    // the child will have the point in its parent's coordinate frame (i.e. this node's frame)
                    if( child.containsPoint( localPoint ) ) {
                        return true;
                    }
                }
            }
            
            // didn't hit our children, so check ourself as a last resort
            if( this._selfBounds.containsPoint( point ) ) {
                return this.containsPointSelf( point );
            }
        },
        
        // override for computation of whether a point is inside the content rendered in renderSelf
        // point is considered to be in the local coordinate frame
        containsPointSelf: function( point ) {
            if( this.hasShape() ) {
                var result = this._shape.containsPoint( point );
                
                // also include the stroked region in the hit area if applicable
                if( !result && _includeStrokeInHitRegion && this.hasStroke() ) {
                    result = this._shape.getStrokedShape( this._lineDrawingStyles ).containsPoint( point );
                }
                return result;
            } else {
                // if self bounds are not null default to checking self bounds
                return this._selfBounds.containsPoint( point );
            }
        },
        
        // whether this node's self intersects the specified bounds, in the local coordinate frame
        intersectsBoundsSelf: function( bounds ) {
            if( this.hasShape() ) {
                // TODO: should a shape's stroke be included?
                return this._shape.intersectsBounds( bounds );
            } else {
                // if self bounds are not null, child should override this
                return this._selfBounds.intersectsBounds( bounds );
            }
        },
        
        hasShape: function() {
            return this._shape != null;
        },
        
        hasFill: function() {
            return this._fill != null;
        },
        
        hasStroke: function() {
            return this._stroke != null;
        },
        
        hasParent: function() {
            return this.parent !== null;
        },
        
        hasChildren: function() {
            return this.children.length > 0;
        },
        
        walkDepthFirst: function( callback ) {
            callback( this );
            _.each( this.children, function( child ) {
                child.walkDepthFirst( callback );
            } );
        },
        
        getChildrenWithinBounds: function( bounds ) {
            return _.filter( this.children, function( child ) { return !child._bounds.intersection( bounds ).isEmpty(); } );
        },
        
        // returns a list of ancestors of this node, with the root first
        getAncestors: function() {
            return this.parent ? this.parent.getPathToRoot() : [];
        },
        
        // like getAncestors(), but includes the current node as well
        getPathToRoot: function() {
            var result = [];
            var node = this;
            
            while( node != null ) {
                result.unshift( node );
                node = node.parent;
            }
            
            return result;
        },
        
        // node that would be rendered previously, before this node
        getPreviousRenderedNode: function() {
            // we are the root (or base of a subtree)
            if( this.parent == null ) {
                return null;
            }
            var index = _.indexOf( this.parent.children, this );
            if( index - 1 < 0 ) {
                // first child under a parent, so the parent would be rendered first
                return this.parent;
            } else {
                // otherwise, walk up the previous sibling's tree
                var node = this.parent.children[index-1];
                while( node.children.length > 0 ) {
                    node = _.last( node.children );
                }
            }
        },
        
        // node that would be rendered next, after it's self AND all children (ignores visibility). if this node has a next sibling, it will be returned
        getNextRenderedNode: function() {
            var node = this.parent;
            while( node != null ) {
                var index = _.indexOf( node.children, this );
                if( index + 1 < node.children.length ) {
                    return node.children[index + 1];
                }
            }
            
            // we were the last node rendered
            return null;
        },
        
        // the layer that would be in the render state before this node and its children are rendered, and before _layerBeforeRender
        getLayerBeforeNodeRendered: function() {
            if( this._layerBeforeRender ) {
                if( this.parent == null ) {
                    return this._layerBeforeRender;
                } else {
                    var index = _.indexOf( this.parent.children, this );
                    if( index - 1 < 0 ) {
                        return this.parent._layerReference;
                    } else {
                        return this.parent.children[index-1].getLayerAfterNodeRendered();
                    }
                }
            } else {
                return this._layerReference;
            }
        },
        
        // the layer that would be in the render state, after this node and its children are rendered, and after _layerAfterRender is processed
        getLayerAfterNodeRendered: function() {
            // this would happen after any children are rendered, so shortcut it
            if( this._layerAfterRender ) {
                return this._layerAfterRender;
            }
            
            if( this.hasChildren() ) {
                return _.last( this.children ).getLayerAfterNodeRendered();
            } else {
                return this._layerReference;
            }
        },
        
        getTranslation: function() {
            return this.transform.getMatrix().translation();
        },
        
        getScaling: function() {
            return this.transform.getMatrix().scaling();
        },
        
        getRotation: function() {
            return this.transform.getMatrix().rotation();
        },
        
        getX: function() {
            return getTranslation().x;
        },
        
        getY: function() {
            return getTranslation().y;
        },
        
        /*---------------------------------------------------------------------------*
        * Coordinate transform methods
        *----------------------------------------------------------------------------*/        
        
        // apply this node's transform to the point
        localToParentPoint: function( point ) {
            return this.transform.transformPosition2( point );
        },
        
        localToParentBounds: function( bounds ) {
            return this.transform.transformBounds2( bounds );
        },
        
        // apply the inverse of this node's transform to the point
        parentToLocalPoint: function( point ) {
            return this.transform.inversePosition2( point );
        },
        
        parentToLocalBounds: function( bounds ) {
            return this.transform.inverseBounds2( bounds );
        },
        
        // apply this node's transform (and then all of its parents' transforms) to the point
        localToGlobalPoint: function( point ) {
            var node = this;
            while( node != null ) {
                point = node.transform.transformPosition2( point );
                node = node.parent;
            }
            return point;
        },
        
        localToGlobalBounds: function( bounds ) {
            var node = this;
            while( node != null ) {
                bounds = node.transform.transformBounds2( bounds );
                node = node.parent;
            }
            return bounds;
        },
        
        globalToLocalPoint: function( point ) {
            var node = this;
            
            // we need to apply the transformations in the reverse order, so we temporarily store them
            var transforms = [];
            while( node != null ) {
                transforms.push( node.transform );
                node = node.parent;
            }
            
            // iterate from the back forwards (from the root node to here)
            for( var i = transforms.length - 1; i >=0; i-- ) {
                point = transforms[i].inversePosition2( point );
            }
            return point;
        },
        
        globalToLocalBounds: function( bounds ) {
            var node = this;
            
            // we need to apply the transformations in the reverse order, so we temporarily store them
            var transforms = [];
            while( node != null ) {
                transforms.push( node.transform );
                node = node.parent;
            }
            
            // iterate from the back forwards (from the root node to here)
            for( var i = transforms.length - 1; i >=0; i-- ) {
                bounds = transforms[i].inverseBounds2( bounds );
            }
            return bounds;
        }
    };
})();
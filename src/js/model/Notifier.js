// Copyright 2002-2012, University of Colorado

/**
 * See Java docs for now
 *
 * @author Jonathan Olson
 */

var phet = phet || {};
phet.model = phet.model || {};

// create a new scope
(function () {
  "use strict";
  
  phet.model.Notifier = function () {
    this.listeners = [];
  };

  var Notifier = phet.model.Notifier;

  Notifier.prototype = {
    constructor: Notifier,

    addListener: function ( listener ) {
      this.listeners.push( listener );
    },

    addUpdateListener: function ( listener, fireOnAdd ) {
      this.listeners.push( listener );
      if ( fireOnAdd ) {
        listener();
      }
    },

    removeListener: function ( listener ) {
      this.listeners.splice( this.listeners.indexOf( listener ), 1 );
    },

    updateListeners: function ( value ) {
      for ( var i = 0; i < this.listeners.length; i++ ) {
        this.listeners[i]( value );
      }
    }
  };

  phet.model.CompositeNotifier = function ( notifiers ) {
    Notifier.call( this );

    this.notifiers = notifiers;
    
    var that = this;
    function updateListener( value ) {
      that.updateListeners( value );
    }

    // when one of these notifiers fires, fire ourself
    
    for ( var i = 0; i < notifiers.length; i++ ) {
      notifiers[i].addListener( updateListener );
    }
  };

  // essentially inheritance
  var CompositeNotifier = phet.model.CompositeNotifier;
  CompositeNotifier.prototype = phet.Object.create( Notifier.prototype );
  CompositeNotifier.prototype.constructor = CompositeNotifier;
})();

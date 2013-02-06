
(function(){
    
    var main = $( '#main' );
    
    var suite = benchmarkTimer.currentSuite;
    
    suite.add( 'Canvas creation', function() {
        document.createElement( 'canvas' );
    } );
    
    suite.add( 'Canvas/context creation', function() {
        var canvas = document.createElement( 'canvas' );
        var context = phet.canvas.initCanvas( canvas );
    } );
    
    suite.add( 'Fast on current version', function() {
        var count = 0;
        for( var i = 0; i < 100; i++ ) {
            count = count * i + Math.sin( i );
        }
    } );
    
    suite.add( 'Slow on current version', function() {
        
    } );
    
    suite.add( 'Fast deferred on current version', function( deferrer ) {
        if( !deferrer ) {
            console.log( 'no deferrer: ' + deferrer );
            console.log( 'fast old' );
        }
        setTimeout( function() {
            deferrer.resolve();
        }, 1000 );
    }, { defer: true } );
    
    suite.add( 'Slow deferred on current version', function( deferrer ) {
        if( !deferrer ) {
            console.log( 'no deferrer: ' + deferrer );
            console.log( 'slow old' );
        }
        deferrer.resolve();
    }, { defer: true } );
    
    suite.add( 'Control Bench A', function() {
        var count = 0;
        for( var i = 0; i < 100; i++ ) {
            count = count * i + Math.sin( i );
        }
    } );
    
    suite.add( 'Control Bench B', function() {
        var count = 0;
        for( var i = 0; i < 100; i++ ) {
            count = count * i + Math.sin( i );
        }
    }, {
        setup: function() {
            var count = 0;
            for( var i = 0; i < 10000; i++ ) {
                count = count * i + Math.sin( i );
            }
        },
        
        teardown: function() {
            var count = 0;
            for( var i = 0; i < 10000; i++ ) {
                count = count * i + Math.sin( i );
            }
        }
    } );
    
    // marks.run( [
    //     new Benchmark( 'Canvas creation', function() {
    //         document.createElement( 'canvas' );
    //     } ),
        
    //     new Benchmark( 'Canvas/context creation', function() {
    //         var canvas = document.createElement( 'canvas' );
    //         var context = phet.canvas.initCanvas( canvas );
    //     } ),
        
    //     new Benchmark( 'Fast on current version', function() {
    //         var count = 0;
    //         for( var i = 0; i < 100; i++ ) {
    //             count = count * i + Math.sin( i );
    //         }
    //     } );
        
    //     new Benchmark( 'Slow on current version', function() {
            
    //     } );
    // ] );
    
    
    
    
    // sceneBench( 'canvas creation', function( deferred ) {
    //     var canvas = document.createElement( 'canvas' );
    // } );
    
    // sceneBench( 'canvas/context creation', function( deferred ) {
    //     var canvas = document.createElement( 'canvas' );
    //     var context = phet.canvas.initCanvas( canvas );
    // } );
    
    // sceneBench( 'Fast On Current', function( deferrer ) {
    //     var arb = deferrer;
    //     setTimeout( function() {
    //         arb.resolve();
    //     }, 50 );
    // }, true );
    
    // sceneBench( 'Slow On Current', function( deferred ) {
    //     deferred.resolve();
    // }, true );
    
})();

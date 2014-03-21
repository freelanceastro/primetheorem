///////////////////////////////////////////////////////////
// First, let's set some global variables and functions. //
///////////////////////////////////////////////////////////

// Does what it says on the tin -- this function returns a truthy value if the input is prime, and a falsy one otherwise.
isPrime = function(i) {
    if (i < 2) {return 0;};
    var result = 1;
    var l = 2;
    while (result && l <= Math.sqrt(i)){
            result = i%l;
            l += 1;
    }
    return result;
};

// We need a function that returns the prime factors of a number as an array of objects -- 
// and it needs to return the right *number* of each factor.
var primeFac = function(x) {
    var primefacs = []                      // A place for the prime factors to live.
    if (isPrime(x)) {primefacs.push({name:x, value:1});}    // If the input is prime, put it into the list of prime factors and skip to the end.
    else {
        for (var i = 2; i < x; i += 1) {
          if (isPrime(i) && (x%i === 0)) {  // if it's both prime and a factor... 
              primefacs.push({name:i, value:1});            // ...put it in the list of prime factors...
              var q = x/i;
              while (q%i === 0) {
                  primefacs.push({name:i, value:1})         // ...and keep putting in that factor as many times as you can.
                  q /= i;
              }
          }    
        }
    }
    return primefacs;
};

var productString = function(x) {
    // If x is composite, returns a string expressing the product of x's prime factors.
    // If x is prime, returns a string saying "X is prime!"
    // If x is 1, returns a string saying "Why isn't 1 prime?"
    if (x === 1) {return "why isn't 1 prime?";}
    else if (isPrime(x)) {return x + " is prime!";};
    var primestring = "";
    for (var i = 2; i < x; i += 1) {
      if (isPrime(i) && (x%i === 0)) {  // if it's both prime and a factor... 
          primestring += i + " \u00D7 ";            // ...put it in the product of prime factors...
          var q = x/i;
          while (q%i === 0) {
              primestring += i + " \u00D7 ";         // ...and keep putting in that factor as many times as you can.
              q /= i;
          }
      }    
    }
    primestring = primestring.slice(0, -2);
    primestring += " = " + x
    return primestring;
}

// And a simple key-obtaining function.
var keys = function(d) {return d.key;};

var labelsize_fit = function(text, desired_size, alloted_space){
    // Places dummy text of the desired size, measures its length, deletes the dummy text
    // and then scales the size of the actual label appropriately if it won't fit in the alloted space at the desired size.
    // This makes it possible to scale the font size within the prime numbers and factors properly.
    // I doubt that many users will actually get up to four-digit primes, where this is relevant.
    // But on a site with over 100,000 hits per day, we should at least account for the possibility...
    var newsize = 0;
    svg.append("text")
        .attr("opacity", 0)
        .text(text)
        .attr("font-family", "sans-serif")
        .attr("font-size", desired_size)
        .each(function(){
            newsize = Math.min(1, alloted_space/this.getComputedTextLength()) * desired_size;
        })
        .remove();
    return newsize;
};

// Time for D3!

///////////////////////////////
// Setting up the SVG canvas //
///////////////////////////////

// Find the height and width of the current window.
// Note that this will not rescale if you change the window size while on the page,
// but I find it hard to care about that.
// var H = d3.select("body").property("scrollHeight");
// var W = d3.select("body").property("scrollWidth");
var H = window.innerHeight;
var W = window.innerWidth;

var svg = d3.select("body").append("svg")   // Create the big svg canvas that will hold all of the stuff.
            .attr("height", H)
            .attr("width", W);

svg.append("line")                          // Laying down a number line.
    .attr("x1", 0)
    .attr("x2", W)
    .attr("y1", 9*H/16)
    .attr("y2", 9*H/16);

// Drawing the question mark in the lower-right corner.
var q = svg.append("a")
            .attr("xlink:href", "http://en.wikipedia.org/wiki/Fundamental_theorem_of_arithmetic")
            .attr("xlink:show", "new")
            .append("text")
            .text("?")
            .attr("font-family", "sans-serif")
            .attr("text-anchor", "middle")
            .attr("font-size", Math.min(W, H)/20)
            .attr("x", 14*W/15)
            .attr("y", 14*H/15)
            .attr("opacity", 0.2);

////////////////////////////////////////////////////////////////////
// Setting up the natural numbers (the lower part of the display) //
////////////////////////////////////////////////////////////////////

// Pick the natural number that will show up as "in focus" when the page loads.
var nat_central_val = 24;

// The number of natural numbers displayed in the lower part of the display. This must be an odd number.
var num_nats = 11;

// Populating an array with our natural number objects.
var nat_min = nat_central_val - (num_nats - 1)/2;
var nat_max = nat_central_val + (num_nats - 1)/2;
var naturals = [];
for (var j = 0; j < num_nats; j += 1){
    naturals.push({key:j, ord:j, value:d3.range(nat_min, nat_max + 1)[j]}); // d3.range() is basically Python's range() function, thank goodness.
    
    // Value is the actual natural number.
    // key is how D3 will keep track of the different natural number objects.
    // ord is the ordinality, in the common sense -- first, second, third -- of the natural number among those on the screen.
    // I need this for scaling purposes.
    // ord is the same as key at the start, but they'll vary wildly once the interactivity starts up.
    
};

var nat_central = naturals[(num_nats - 1)/2]        // The central natural number object.

////////////////////////////////////
// Setting up the scales for the natural numbers, which is a pain!
// It's complicated, because they have to get bigger and then smaller again.
// They also have to have that scaling transform appropriately when transitions occur, so it all has to scale nicely.
// Oh, and we need to keep the right spacing between them, and make sure that the damn thing looks good.
//
// Here's the overall scaling strategy:
// First, create an appropriate scale that looks good for relative sizes of circles from a minimum size up to a maximum size,
//          ignoring the size of the SVG canvas. (natScale_sub1)
// Next, get that function to count down back to the minimum size
//              once it's handed a value past the ordinal value of nat_central. (natScale_sub2)
// Finally, renormalize all of this to make sure everything fits on the SVG canvas. (natScale)
// Attach a few methods to natScale for the position of each circle and their actual radii once you take spacing into account,
//              and you're good to go! 

var nat_spacing = 0.2;                                      // Spacing between natural numbers.

var natScale_sub1 = d3.scale.pow().exponent(3)              // Feel free to vary the type of scale here for visual effect.
                        .domain(d3.range(num_nats).slice(0,(num_nats + 1)/2))
                        .range([1, 1.05]);        
                        // It doesn't much matter what these numbers are specifically.
                        // Their ratio determines the ratio of sizes of the biggest and smallest natural number circles.
                        // Feel free to tune it to your liking.
                        
var natScale_sub2 = function(i) {
    var arg = i < (num_nats + 1)/2 ? i : num_nats - i - 1;   // maps [0, 1, ... , num_nats - 1] onto [0, 1, ..., (num_nats - 1)/2, ..., 1, 0]
    return natScale_sub1(arg);
};

var natScale_sum = d3.range(num_nats).map(natScale_sub2);           // map the sub-scale over the entire range of keys
natScale_sum = natScale_sum.reduce(function(a, b) {return a + b;}); // sum the whole array

var natScale = function(i) {                                        // Re-scaling the sub-scale to the width of the svg element.
    var result = natScale_sub2(i);
    result *= W/natScale_sum;
    return result;
};

natScale.pos = function(i) {        
    // Returns the cumulative sum of natScale up to i - 1, plus half of natScale(i).
    // In other words, returns the x-coordinate of the center of circle i within the SVG on natScale.
    var result = d3.range(num_nats).slice(0,i).map(natScale);
    try {result = result.reduce(function(a, b) {return a + b;});} 
        catch (err) {result = 0;} // if i = 0, then reduce will return a ValueError for acting on an empty array.
    result += natScale(i)/2;
    return result;
};

natScale.rad = function(i){
    // Returns the radius of the i-th circle, based on natScale and the spacing constant.
    return natScale(i)*(1 - nat_spacing)/2;
}

/////////////////////////////
// Finally draw some stuff!
// Add the natural number circles and labels to the canvas.

var nat_circles = svg.selectAll("circle.natural")
                .data(naturals, function(d) {return d.key;})
                .enter()
                .append("circle")
                .attr("class", "natural")
                .attr("cx", function(d) {return natScale.pos(d.ord);})
                .attr("cy", 9*H/16)
                .attr("r", function(d) {return natScale.rad(d.ord);});

var nat_labels = svg.selectAll("text.natural")
                .data(naturals, function(d) {return d.key;})
                .enter()
                .append("text")
                .text(function(d) {return d.value;})
                .attr("class", "natural")
                .attr("x", function(d) {return natScale.pos(d.ord);})
                .attr("y", function(d) {return 9*H/16 - 1.05*natScale.rad(d.ord);})
                .attr("font-size", function(d) {return natScale(d.ord)/6;});   // Picked this size because it looks good, nothing more


//////////////////////////////////////////////////////////////////
// Setting up the prime numbers (the upper part of the display) //
//////////////////////////////////////////////////////////////////

// Setting the minimum size for the primes' text
// if they go below this size, the primes just vanish altogether.
var min_prime_size = 2;

// Populating an array with the prime number objects less than nat_central.value.

var primes = [];
for (var i = 2; i <= nat_central.value; i += 1) {
    if (isPrime(i)) {
        var pobj = {key:(primes.length), value:i};
        primes.push(pobj);
        };
};

// Setting up the prime number scale.
// Thankfully, this is far more straightforward than the natural number scale.

var max_prime_rad = Math.max(W, H)/36;     // We don't want to let the primes get too big, or else they'll eat the screen at the low end of the number line.
                            // This is just a nice number that I pulled out of a hat. Feel free to tweak it.
                                       
var prime_spacing = 0.15;   // spacing between bands on prime scale

// alternate minimum and maximum of the prime scale, keeping the primes from getting too big.
var alt_prime_min = (W - (1 + 2*prime_spacing)*max_prime_rad*primes.length)/2;
var alt_prime_max = (W + (1 + 2*prime_spacing)*max_prime_rad*primes.length)/2;
                          
var primeScale = d3.scale.ordinal()
                     .domain(d3.range(primes.length))
                     .rangeRoundBands([Math.max(0, alt_prime_min), Math.min(W, alt_prime_max)], prime_spacing);


// Adding in a label for the infinite prime dust.
svg.append("a")
     .attr("xlink:href", "http://en.wikipedia.org/wiki/Euclid%27s_theorem")
     .attr("xlink:show", "new")
     .attr("id", "new-prime-label-link")
     .append("text")
     .text("the primes, like dust...")
     .attr("id", "new-prime-label")
     .attr('x', W/2)
     .attr('y', 3* min_prime_size + natScale(nat_central.ord)/10)
     .attr('font-size', natScale(nat_central.ord)/10);
 
// And adding in a label for the primes as a whole.
svg.append('text')
     .attr("id", "prime-label")
     .text("prime numbers")
     .attr('x', W/2)
     .attr('y', 1.5 * primeScale.rangeBand() + natScale(nat_central.ord)/10)
     .attr('font-size', natScale(nat_central.ord)/10);

// Making sure the primes are NOT drawn if they're too small!
if ( primeScale.rangeBand()/2 >= min_prime_size){

    // Actually drawing the primes and their labels up top!
    svg.selectAll("circle.prime")
        .data(primes)
        .enter()
        .append("circle")
        .attr("class", "prime")
        .attr("cx", function(d, i) {return primeScale(i) + primeScale.rangeBand()/2;})
        .attr("cy", primeScale.rangeBand())          // Always one diameter from the top!
        .attr("r", primeScale.rangeBand()/2)
        .attr("value", function(d) {return d.value;})

    svg.selectAll('text.prime')
        .data(primes)
        .enter()
        .append('text')
        .text(function(d) {return d.value;})
        .attr("class", "prime")
        .attr('x', function(d, i) { return primeScale(i) + primeScale.rangeBand()/2;})
        .attr('y', function(d) { return 1.175 * primeScale.rangeBand(); })          // Apparently, in this font, numbers are 0.7 their font size.
        .attr("font-size", primeScale.rangeBand()/2);

    // Make the prime-dust label invisible.
    svg.selectAll("#new-prime-label")
        .style("opacity", 0)
        .attr("font-size", 0);

}
else {

    // Make the normal prime label invisible.
    svg.selectAll("#prime-label")
        .style("opacity", 0)
        .attr("font-size", 0);

};

/////////////////////////////////////////////////////////////////////////
// Setting up the prime factors (the circles that fly in from the top) //
////////////////////////////////////////////////////////////////////////

// I'm taking advantage of d3's pack() layout to automatically calculate the positions of prime factors within the natural number circle.
// This is a little complicated, but not nearly as complicated as working out the geometry manually.

// This number determines the amount of padding between prime factors.
var pad_width = 5;

// The object that we'll feed into d3.layout.pack().
// It represents the central natural number and its relationship to its prime factors.
var nat_bubble = {name:nat_central.value, value:1, children:primeFac(nat_central.value)};

// Setting up the pack layout.
var bubble = d3.layout.pack()
                .size([natScale.rad(nat_central.ord), natScale.rad(nat_central.ord)])
                .sort(null)
                .padding(pad_width);
                
var bubble_g = svg.append("g");

// Drawing some invisible circles.
// This is necessary to get pack.nodes() to calculate and populate the necessary data fields.
var fakecircles = bubble_g.selectAll(".nodes")
                    .data(bubble.nodes(nat_bubble))
                    .enter()
                    .append("circle")
                    .attr("opacity", 0);

var bubblevars = fakecircles.data() // Pulls the objects out of the fakecircles data field -- this is the only reason those circles exist!
var bigc = bubblevars.shift();      // The big circle the prime factors are enclosed in.
var pvars = bubblevars;             // The prime factors

// Centering and rescaling the prime factor circles within the natural number circle in focus.
for (var i = 0; i < pvars.length; i += 1) {
    pvars[i].x = (pvars[i].x - bigc.x)/bigc.r * natScale.rad(nat_central.ord) + W/2;
    pvars[i].y = (pvars[i].y - bigc.y)/bigc.r * natScale.rad(nat_central.ord) + 9*H/16;
    pvars[i].r *= natScale.rad(nat_central.ord)/bigc.r;
};

// Cleaning up our mess.
delete bubble;
fakecircles.remove();
bubble_g.remove();

//////////////////////////////////////////////////////////////////////////////////////////////////////
// Initial transition: putting prime factors into the first natural number in focus on page load.  //
/////////////////////////////////////////////////////////////////////////////////////////////////////

 // First, find the prime factors you need to work with and hollow them out.
 // Since there can be multiple instances of the same factor, you'll need a set.
 // But JavaScript has no sets and no list comprehensions, so you'll have to do this manually.
 
var pfacs = [];
for (var i = 0; i < pvars.length; i += 1){
    if (pvars[i].name !== pfacs.slice(-1)[0]) {          // Add the prime factor to the list, but only if it's not there already!
        pfacs.push(pvars[i].name);                 
    }
};
 
var isPfac = function(d, i) {
        return pfacs.some(function(x) {return x === d.value;});      // if any entry in pfacs is equal to d.value, return true
};
 
 // Select only the primes that are prime factors of the subject number and hollow them out.

if ( primeScale.rangeBand()/2 >= min_prime_size){
    svg.selectAll("circle.prime")
         .filter(isPfac)
         .attr("class", "hollow-prime");
      
    svg.selectAll("text.prime")
         .filter(isPfac)
         .attr("class", "hollow-prime");
     };
  
 // Then, draw over the hollowed-out primes with the necessary number of prime factor circles.
 
// We need the old locations and sizes of the circles, up at the top of the page, 
// so let's get those and put them in pvars as the "old" location and size.
 
if ( primeScale.rangeBand()/2 >= min_prime_size){
    for (var j = 0; j < pvars.length; j += 1){
        var old_circle = svg.selectAll("circle.hollow-prime")
             .filter(function(d, i) {return d.value === pvars[j].name;});
      
        pvars[j].old_cx = old_circle.attr("cx");
        pvars[j].old_cy = old_circle.attr("cy");
        pvars[j].old_r = old_circle.attr("r");
    };
}
else {
    for (var j = 0; j < pvars.length; j += 1){      
        pvars[j].old_cx = W/2;
        pvars[j].old_cy = 0;
        pvars[j].old_r = 0;
    };
};
 
// Now use those "old" locations and sizes to draw the prime factors and their labels in their initial positions.
 
var newprimes = svg.selectAll("circle.prime-factor")
    .data(pvars)
    .enter()
    .append("circle")
    .attr("class", "prime-factor")
    .attr("cx", function(d) {return d.old_cx;})
    .attr("cy", function(d) {return d.old_cy;})
    .attr("r", function(d) {return d.old_r;});
      
  
var newlabels = svg.selectAll('text.prime-factor')
    .data(pvars)
    .enter()
    .append('text')
    .text(function(d) {return d.name;})
    .attr("class", "prime-factor")
    .attr('x', function(d) { return d.old_cx;})
    .attr('y', function(d) { return 1.175 * d.old_cy;})       // Apparently, in this font, numbers are 0.7 their font size.
    .attr("font-size", function(d) {return d.old_r;});

// And print the equation -- but with a tiny size, so we can transition it in.
svg.append("text")
    .attr("id", "prime-equation")
    .text(productString(nat_central.value))
    .attr("x", W/2)
    .attr("y", 9*H/16 + 1.5*natScale.rad(nat_central.ord))
    .attr("font-size", 0);
    

// Defining a function that transitions the prime factors down to the natural numbers.
// We'll be calling this a lot.
var primefac_transition = function(){

    newprimes.transition()
            .duration(1000)
            .attr("cx", function(d) {return d.x;})
            .attr("cy", function(d) {return d.y;})
            .attr("r", function(d) {return d.r;});


    newlabels.transition()
            .duration(1000)
            .attr("x", function(d) {return d.x;})
            // .attr("y", function(d) {return d.y + 0.35 * d.r;})
            // .attr("font-size", function(d) {return d.r;});
            .attr('y', function(d) { 
                var ls = labelsize_fit(d.name, d.r, 2*d.r)
                return d.y + 0.35 * ls;
                })
            .attr("font-size", function(d) {return 0.95*labelsize_fit(d.name, d.r, 2*d.r)});

    svg.selectAll("#prime-equation")
        .transition()
        .delay(500)
        .duration(500)
        .attr("font-size", natScale(nat_central.ord)/6);
        
};

////////////////////////////////////////////////////////////////////////////////////////////
// The splash screen, the skip button, and the initial transition with the prime factors. //
////////////////////////////////////////////////////////////////////////////////////////////

// Lay down a giant rectangle covering everything on the SVG canvas..
var splash = svg.append("rect")
                .attr("id", "splash")
                .attr("width", W)
                .attr("height", H)
                .attr("opacity", 1);
                
// Set up the text we want to display, line by line.
var splash_strings = ["The fundamental theorem of arithmetic:", 
                "every whole number larger than one",
                'is either a <strong class="splash-emph">prime</strong> number',
                'or can be expressed as a <strong class="splash-emph">unique product</strong> of prime numbers.'];

// Attach that text to a few finely-crafted divs -- 
// it has to be divs, otherwise the in-line HTML tags won't come out.
// There *is* a way to get in-line HTML on SVG text, but this is easier for now.
var splash_text = d3.select("body").selectAll("div.splash")
                        .data(splash_strings)
                        .enter()
                        .append("div")
                        .attr("class", "splash")
                        .style("width", W + "px")
                        .style("left", "0px")
                        .style("top", function(d, i) {return (H/4 + i*H/10) + "px";})
                        .html(function(d) {return d;})
                        .style("font-size", H/20 + "px")
                        .style("opacity", 0);

// Set up the skip button as some unobtrusive text in the upper-right corner.
// Clicking this at any point will instantly remove the giant rectangle, all of the divs with our text, and the skip button itself,
// and it will also start up the initial transition of prime factors down to their natural number.
var splash_skip = svg.append("text")
                        .text("skip >")
                        .attr("font-family", "sans-serif")
                        .attr("text-anchor", "middle")
                        .attr("font-size", H/40)
                        .attr("x", 7*W/8)
                        .attr("y", H/20)
                        .attr("opacity", 0.15)
                        .on("click", function(thing) { 
                            splash_text.remove();
                            splash.remove();
                            d3.select(this).remove();
                            primefac_transition();
                            });

// Transition in the divs with our text, one by one -- 
// and then after a reasonable amount of time, turn down the opacity on all of them and remove them.
splash_text.transition()
            .duration(1500)
            .delay(function(d, i) {return i*2000})
            .style("opacity", 1.0)
            .transition()
            .delay(10500)
            .duration(1500)
            .style("opacity", 0)
            .remove();

// Turn down the opacity on the giant rectangle in sync with the text and remove it.
splash.transition()
        .delay(10500)
        .duration(1500)
        .attr("opacity", 0)
        .remove();

// If we reach the point where the splash screen starts going away of its own accord, 
// turn off the skip button and transition it to invisibility in sync with the rest of the splash screen.
// Then, when it's done, start up the initial transition of the prime factors down to their natural number.
// Finally, remove the skip button altogether.
splash_skip.transition()
    .delay(10500)
    .duration(1500)
    .each("start", function(){
        d3.select(this).attr("pointer-events", "none");
    })
    .attr("opacity", 0)
    .each("end", primefac_transition)
    .remove();

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Interactive transitions: changing the natural number in focus when you click on it and bringing down its prime factors, //
// and other stuff like the tooltips and mouseovers for the natural numbers.                                               //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Defining some functions that determine what happens when certain actions are taken.
// We'll call them when we bind listeners to objects later on.

var over_func = function(nat_num) {
    // Defines response for mousing over a natural number.
   
    d3.select(this)
        .transition()
        .duration(300)
        .attr("r", function(d) {return 1.15*natScale.rad(d.ord);});
    
    var key = nat_num.key;
    svg.selectAll("text.natural")
        .filter(function(d) {return d.key === key;})
        .transition()
        .duration(300)
        .attr("y", function(d) {return 9*H/16 - 1.20*natScale.rad(d.ord);});
    
};

var out_func = function(nat_num) {
    // Defines response for mousing out of a natural number.
    
    d3.select(this)
        .transition()
        .duration(100)
        .attr("r", function(d) {return natScale.rad(d.ord);});
    
    var key = nat_num.key;
    svg.selectAll("text.natural")
        .filter(function(d) {return d.key === key;})
        .transition()
        .duration(100)
        .attr("y", function(d) {return 9*H/16 - 1.05*natScale.rad(d.ord);});
};

var one_over_func = function(d) {
    // Defines response for popping up the tooltip about one not being prime.
    
    var boxwidth = W/7;
        
    // //Get the x/y values for the tooltip based on the position of the mouse.
    var xPosition = d3.mouse(svg[0][0])[0];
    var yPosition = d3.mouse(svg[0][0])[1];

    //Update the tooltip position and value
    d3.select("#one-tooltip")
    .style("width", boxwidth + "px")
    .style("left", xPosition + "px")
    .style("top", yPosition + "px")
    .select("p")
    .style("font-size", W/80 + "px");

    //Show the tooltip
    d3.select("#one-tooltip").classed("hidden", false);

};

var one_out_func = function() {
    // Hides the one-isn't-prime tooltip.

    d3.select("#one-tooltip").classed("hidden", true);            

};


///////////////////////////
// The main event: the function that defines response when natural numbers are clicked.

var clickfunc = function(nat_num_obj) {
        
        ////////////////////////////////////////////////////////////////////////////////////////////////////
        // FIRST: turn off all natural circles' mouse sensitivity, and ensure they're all the right size. //
        ////////////////////////////////////////////////////////////////////////////////////////////////////
            
        d3.select(this)
            .on("mouseover", null)
            .on("mouseout", null)
            .on("click", null);
        
        svg.selectAll("circle.natural")
            .style("pointer-events", "none")
            .attr("r", function(d) {return natScale.rad(d.ord);});
            
        svg.selectAll("text.natural")
            .style("pointer-events", "none")
            .attr("y", function(d) {return 9*H/16 - 1.05*natScale.rad(d.ord);});
        
        /////////////////////////////////
        // Quickly send the prime factors back to where they came from, 
        // fill in the hollow primes, remove the prime factors entirely,
        // and get rid of the old equation.
        
        svg.selectAll(".hollow-prime")
            .attr("class", "prime");
        
        svg.selectAll("circle.prime-factor")
            .attr("class", "old-prime-factor")
            .data([])
            .exit()
            .transition()
            .duration(500)
            .attr("cx", function(d) {return d.old_cx;})
            .attr("cy", function(d) {return d.old_cy;})
            .attr("r", function(d) {return d.old_r;})
            .remove();
        
        svg.selectAll("text.prime-factor")
            .attr("class", "old-prime-factor")
            .data([])
            .exit()
            .transition()
            .duration(500)
            .attr("x", function(d) {return d.old_cx;})
            .attr("y", function(d) {return 1.175 * d.old_cy;})      
            .attr("font-size", function(d) {return d.old_r;})
            .remove();
        
        svg.selectAll("#prime-equation")
            .attr("id", "old-prime-equation")
            .transition()
            .duration(500)
            .attr("font-size", 0)
            .remove()
        
        /////////////////////////
        // Now ID the natural number that was clicked and determine its relationship to the old central number.  
                
        var diff = nat_num_obj.value - nat_central.value;
        var diff_bool = diff > 0;
        var diff_sign = diff/Math.abs(diff);
        
         
        /////////////////////  
        // Then, add in the necessary new natural number objects to naturals, update the remaining ones, and remove the old ones.
        
        // Update the old ord values.
        
        naturals.forEach(function(o) {o.ord -= diff;});
        
        // Finding the new natural numbers.
        var new_nats = diff_bool? d3.range(nat_max + 1, nat_max + diff + 1) : d3.range(nat_min + diff, nat_min);
        
        var max_key_var = d3.max(naturals.map(keys));
        
        // Adding in the new natural number objects.
        for (var j = 0; j < new_nats.length; j += 1){
            var ord_var = diff_bool? num_nats - diff + j : j;
            var key_var = max_key_var + j + 1;      // Making sure that none of the keys are duplicates.
            naturals.push({key:key_var, ord:ord_var, value:new_nats[j]});   // d3.range() is basically Python's range() function, thank goodness.
            
            // Value is the actual natural number.
            // key is how D3 will keep track of the different natural number objects.
            // ord is the ordinality, in the common sense -- first, second, third -- of the natural number among those on the screen.
            // I need this for scaling purposes.
        };
        
        // Removing the old natural number objects.
        // We couldn't do this first, because we had to make sure no duplicate keys were created.
        // And no, we can't just have a permanently existing number line -- 
        // making it big enough to ensure the user could never reach the end in a reasonable amount of time would make a *huge* array.
        // I don't want a sluggish response, and this will work.
        
        // Filtering out natural number objects whose values are more than the appropriate distance away from the new central value.
        var oldNat = function(o) {
            return Math.abs(o.value - nat_num_obj.value) <= (num_nats - 1)/2;
        };
        
        naturals = naturals.filter(oldNat);
        
        // Filtering out natural number objects whose values are bad (i.e. too low.)
        // We don't have to worry about the user hitting max_int, because that would take about 60 million years.
        var badNat = function(o) {
            return o.value > 0;
        };
        
        naturals = naturals.filter(badNat);
        
        ///////////////////////
        // Binding the new naturals to nat_circles and nat_labels, and creating objects just off the SVG canvas for the new naturals.
        
        var nat_circles = svg.selectAll("circle.natural").data(naturals, keys);
        var nat_labels = svg.selectAll("text.natural").data(naturals, keys);
        
        nat_circles.enter()
            .append("circle")
            .attr("class", "natural")
            .attr("cx", function(d) {
                // Line up the entering natural numbers in order just outside the left or right side of the SVG, as appropriate.
                return diff_bool? W + (d.ord - (num_nats - 1) + diff)*natScale.pos(0) : (d.ord + diff)*2*natScale.pos(0);
                })
            .attr("cy", 9*H/16)
            .attr("r", natScale.rad(0));       // as small as the smallest natural-number circle.

        nat_labels.enter()
            .append("text")
            .text(function(d) {
                return d.value;
                })
            .attr("class", "natural")
            .attr("x", function(d) {
                // Line up the entering natural numbers in order just outside the left or right side of the SVG, as appropriate.
                return diff_bool? W + (d.ord - (num_nats - 1) + diff)*natScale.pos(0) : (d.ord + diff)*2*natScale.pos(0);
                })
            .attr("y", 9*H/16 - 1.05*natScale.rad(0))
            .attr("font-size", natScale(0)/6);           // as small as the smallest natural-number label.
        
        //////////////////////
        // Natural number exit transitions. 
        
        nat_circles.exit()
            .transition()
            .duration(1000)
            .each("start", function(){
                d3.select(this)
                    .style("pointer-events", "none");       // Making the element unclickable, to prevent interrupting the transition.
            })
            .attr("cx", function(d) {
                // Line up the exiting natural numbers in order just outside the left or right side of the SVG, as appropriate.
                return diff_bool? d.ord * 2*natScale.pos(0) : W + (d.ord - (num_nats - 1))*2*natScale.pos(0);
                })
            .attr("r", natScale.rad(0))
            .remove();
        
        nat_labels.exit()
            .transition()
            .duration(1000)
            .each("start", function(){
                d3.select(this)
                    .style("pointer-events", "none");       // Making the element unclickable, to prevent interrupting the transition.
            })
            .attr("x", function(d) {
                // Line up the exiting natural numbers in order just outside the left or right side of the SVG, as appropriate.
                return diff_bool? d.ord * 2*natScale.pos(0) : W + (d.ord - (num_nats - 1))*2*natScale.pos(0);
                })
            .attr("y", 9*H/16 - 1.05*natScale.rad(0))
            .attr("font-size", natScale(0)/6)
            .remove();
        
        ///////////////////////
        // Natural number enter transitions.
                
        nat_circles.transition()
            .duration(1000)
            .each("start", function(){
                d3.select(this)
                    .style("pointer-events", "none");       // Making the element unclickable, to prevent interrupting the transition.
            })
            .attr("cx", function(d) {return natScale.pos(d.ord);})
            .attr("cy", 9*H/16)
            .attr("r", function(d) {return natScale.rad(d.ord);})
            .each("end", function(){
                d3.select(this)
                    .style("pointer-events", null);     // Restoring the element's clickability.
            });
            
        nat_labels.transition()
            .duration(1000)
            .each("start", function(){
                d3.select(this)
                    .style("pointer-events", "none");   // Making the element unclickable, to prevent interrupting the transition.
            })
            .attr("x", function(d) {return natScale.pos(d.ord);})
            .attr("y", function(d) {return 9*H/16 - 1.05*natScale.rad(d.ord);})
            .attr("font-size", function(d) {return natScale(d.ord)/6;})   // Picked this size because it looks good, nothing more
            .each("end", function(){
                d3.select(this)
                    .style("pointer-events", null);     // Restoring the element's clickability.
            });
        
        // Making sure all the circles have all the appropriate event listeners.
       
        // d3.selectAll(".natural")
        //     .on("click", clickfunc);
        
        d3.selectAll("circle.natural")
            .on("mouseover", over_func)
            .on("mouseout", out_func);
            
        d3.selectAll(".natural")
            .call(drag_thing);
        
        // Except, of course, for the central one.
        d3.selectAll(".natural")
            .filter(function(d) {return d.ord === (num_nats - 1)/ 2;})
            .on("mouseover", null)
            .on("mouseout", null)
            .on("click", null);
        
        ////////////////////
        // Adding and removing prime number objects from the primes array.
        
        if (diff_bool){                                                     // If the new natural number is bigger...
            for (var i = nat_central.value + 1; i <= nat_num_obj.value; i += 1){
                if (isPrime(i)) {
                    var pobj = {key:(primes.length), value:i};              // ...add all primes between the old natural number and the new one.
                    primes.push(pobj);
                };
            };
        }
        else {                                                              // If the old natural number is bigger than the new one...
            for (var i = nat_central.value; i > nat_num_obj.value; i -= 1){
                if (isPrime(i)) {
                    primes.pop();                                           // ...remove the last prime for each prime between the two numbers.
                };
            };
        };
        
        
        /////////////////////////
        // Reset the globals to prepare for a new click, and to make it easier to bring down the new prime factors.
        
        nat_central = nat_num_obj;        // The central natural number object.
        nat_min = nat_central.value - (num_nats - 1)/2;
        nat_max = nat_central.value + (num_nats - 1)/2;
        
        ///////////////////
        // Prime number binding, scaling, enter and exit transitions.
        
        // Resetting the prime number scale.
        // Thankfully, this is far more straightforward than the natural number scale.
        
        // alternate minimum and maximum of the prime scale, keeping the primes from getting too big.
        var alt_prime_min = (W - (1 + 2*prime_spacing)*max_prime_rad*primes.length)/2;
        var alt_prime_max = (W + (1 + 2*prime_spacing)*max_prime_rad*primes.length)/2;
        
        primeScale = d3.scale.ordinal()
                                .domain(d3.range(primes.length))
                                .rangeRoundBands([Math.max(0, alt_prime_min), Math.min(W, alt_prime_max)], prime_spacing); 

        if (primeScale.rangeBand()/2 >= min_prime_size || nat_central.value === 1){

                // Binding the primes to the circles and text.
                prime_circles = svg.selectAll("circle.prime").data(primes);
                prime_labels = svg.selectAll('text.prime').data(primes);

                // Drawing the new primes and their labels up top, super-tiny, so they can pop in from nowhere.
                prime_circles.enter()
                    .append("circle")
                    .attr("class", "prime")
                    .attr("cx", function(d, i) {return primeScale(i) + primeScale.rangeBand()/2;})
                    .attr("cy", primeScale.rangeBand())          // Always one diameter from the top!
                    .attr("r", 0)
                    .attr("value", function(d) {return d.value;});

                prime_labels.enter()
                    .append('text')
                    .text(function(d) {return d.value;})
                    .attr("class", "prime")
                    .attr('x', function(d, i) { return primeScale(i) + primeScale.rangeBand()/2;})
                    .attr('y', function(d) { return Math.round(1.175 * primeScale.rangeBand()); })          // Apparently, in this font, numbers are 0.7 their font size.
                    .attr("font-size", 0);
        
                // Exiting the old primes.
                prime_circles.exit()
                    .transition()
                    .duration(500)
                    .attr("r", 0)
                    .remove();

                prime_labels.exit()
                    .transition()
                    .duration(500)
                    .attr("font-size", 0)
                    .remove();
        
                // Transitioning in the new primes!
                prime_circles.transition()
                    .duration(1000)
                    .attr("cx", function(d, i) {return primeScale(i) + primeScale.rangeBand()/2;})  // Move everyone over...
                    .attr("cy", primeScale.rangeBand())          // Always one diameter from the top!
                    .attr("r", primeScale.rangeBand()/2);                               // ...scale them down as needed, and scale the new one in!
        
                prime_labels.transition()
                    .duration(1000)
                    .attr('x', function(d, i) { return primeScale(i) + primeScale.rangeBand()/2;})  // Move everyone over...
                    .attr('y', function(d) { return Math.round(1.175 * primeScale.rangeBand()); })
                    .attr("font-size", primeScale.rangeBand()/2);                       // ...scale them down as needed, and scale the new one in!
        
                
                svg.select("#prime-label")
                    .transition()
                    .duration(1000)
                    .each("end", function(){dummy_clickfunc(nat_num_obj);})
                    .style("opacity", 0.5)
                    .attr("font-size", natScale(nat_central.ord)/10)
                    .attr('y', 1.5 * primeScale.rangeBand() + natScale(nat_central.ord)/10);
                
                svg.select("#new-prime-label")
                    .transition()
                    .duration(1000)
                    .style("opacity", 0)
                    .attr("font-size", 0);
        
        }
        else {
            
            // Getting rid of any primes that are still hanging out.
            prime_circles = svg.selectAll("circle.prime").data([]);
            prime_labels = svg.selectAll('text.prime').data([]);
            prime_circles.exit().remove();
            prime_labels.exit().remove();
            
            svg.select("#prime-label")
                .transition()
                .duration(1000)
                .each("end", function(){dummy_clickfunc(nat_num_obj);})
                .style("opacity", 0)
                .attr("font-size", 0);
            
            svg.select("#new-prime-label")
                .transition()
                .duration(1000)
                .style("opacity", 0.5)
                .attr("font-size", natScale(nat_central.ord)/10);
        };
                          
        
        ///////////////////
        // Bringing down the new prime factors.
        
        //////
        // First, we have to set up the bubbles again.
        
        // The object that we'll feed into d3.layout.pack().
        // It represents the central natural number and its relationship to its prime factors.
        var nat_bubble = {name:nat_central.value, value:1, children:primeFac(nat_central.value)};
        
        // Setting up the pack layout.
        var bubble = d3.layout.pack()
                        .size([natScale.rad(nat_central.ord), natScale.rad(nat_central.ord)])
                        .sort(null)
                        .padding(pad_width);
        
        var bubble_g = svg.append("g");
        
        // Drawing some invisible circles.
        // This is necessary to get pack.nodes() to calculate and populate the necessary data fields.
        var fakecircles = bubble_g.selectAll(".nodes")
                            .data(bubble.nodes(nat_bubble))
                            .enter()
                            .append("circle")
                            .attr("opacity", 0);
        
        var bubblevars = fakecircles.data() // Pulls the objects out of the fakecircles data field -- this is the only reason those circles exist!
        var bigc = bubblevars.shift();      // The big circle the prime factors are enclosed in.
        var pvars = bubblevars;             // The prime factors
        
        // Centering and rescaling the prime factor circles within the natural number circle in focus.
        for (var i = 0; i < pvars.length; i += 1) {
            pvars[i].x = (pvars[i].x - bigc.x)/bigc.x * natScale.rad(nat_central.ord) + W/2;
            pvars[i].y = (pvars[i].y - bigc.y)/bigc.y * natScale.rad(nat_central.ord) + 9*H/16;
            pvars[i].r *= natScale.rad(nat_central.ord)/bigc.y;
        };
        
        // Cleaning up our mess.
        delete bubble;
        fakecircles.remove();
        bubble_g.remove();
        
        ////////////////////////////
        // Now, find the prime factors you need to work with and hollow them out.
        // Since there can be multiple instances of the same factor, you'll need a set.
        // But JavaScript has no sets and no list comprehensions, so you'll have to do this manually.

        var pfacs = [];
        for (var i = 0; i < pvars.length; i += 1){
           if (pvars[i].name !== pfacs.slice(-1)[0]) {          // If the prime factor isn't in the list already, add it!
               pfacs.push(pvars[i].name);                 
           }
        };

        var isPfac = function(d, i) {
               return pfacs.some(function(x) {return x === d.value;});      // if any entry in pfacs is equal to d.value, return true
        };

        // Select only the primes that are prime factors of the subject number and hollow them out.
        svg.selectAll("circle.prime")
            .filter(isPfac)
            .attr("class", "hollow-prime");
    
        svg.selectAll("text.prime")
             .filter(isPfac)
             .attr("class", "hollow-prime");

        // Then, draw over those primes with the necessary number of circles.

        // We need the old locations and sizes of the circles, up at the top of the page, 
        // so let's get those and put them in pvars as the "old" location and size.
        
        if ( primeScale.rangeBand()/2 >= min_prime_size){
            for (var j = 0; j < pvars.length; j += 1){
                var old_circle = svg.selectAll("circle.hollow-prime")
                     .filter(function(d, i) {return d.value === pvars[j].name;});

                pvars[j].old_cx = old_circle.attr("cx");
                pvars[j].old_cy = old_circle.attr("cy");
                pvars[j].old_r = old_circle.attr("r");
            };
        }
        else {
            for (var j = 0; j < pvars.length; j += 1){      
                pvars[j].old_cx = W/2;
                pvars[j].old_cy = 0;
                pvars[j].old_r = 0;
            };
        };

        newprimes = svg.selectAll("circle.prime-factor")
            .data(pvars)
            .enter()
            .append("circle")
            .attr("class", "prime-factor")
            .attr("cx", function(d) {return d.old_cx;})
            .attr("cy", function(d) {return d.old_cy;})
            .attr("r", function(d) {return d.old_r;})
    

        newlabels = svg.selectAll('text.prime-factor')
             .data(pvars)
             .enter()
             .append('text')
             .text(function(d) {return d.name;})
             .attr("class", "prime-factor")
             .attr('x', function(d, i) { return d.old_cx;})
             .attr('y', function(d) { return 1.175 * d.old_cy; })       // Apparently, in this font, numbers are 0.7 their font size.
             .attr("font-size", function(d) {return d.old_r;});
        
        
        // Print the new equation, but make it super-tiny.
        
        svg.append("text")
             .attr("id", "prime-equation")
             .text(productString(nat_central.value))
             .attr("x", W/2)
             .attr("y", 9*H/16 + 1.5*natScale.rad(nat_central.ord))
             .attr("font-size", 0);

        // Finally, transition those circles to their locations in the bigger circle and scale up the new equation.

        primefac_transition()
        
        // Add a couple of listeners if nat_central.value is 1 in order to bring up the one-isn't-prime tooltip.
        if (nat_central.value === 1) {
            
            svg.selectAll("#prime-equation")
                .on("mouseover", one_over_func)
                .on("mouseout", one_out_func);
            
            svg.selectAll("circle.natural")
                .filter(function(d) {return d.value === 1;})
                .on("mouseover", one_over_func)
                .on("mouseout", one_out_func);
        }
        else {
            one_out_func();
        };
};

var dummy_clickfunc = function(nat_num_obj) {
        
        ////////////////////////////////////////////////////////////////////////////////////////////////////
        // FIRST: turn off all natural circles' mouse sensitivity, and ensure they're all the right size. //
        ////////////////////////////////////////////////////////////////////////////////////////////////////
            
        d3.select(this)
            .on("mouseover", null)
            .on("mouseout", null)
            .on("click", null);
        
        svg.selectAll("circle.natural")
            .style("pointer-events", "none")
            .attr("r", function(d) {return natScale.rad(d.ord);});
            
        svg.selectAll("text.natural")
            .style("pointer-events", "none")
            .attr("y", function(d) {return 9*H/16 - 1.05*natScale.rad(d.ord);});
        
        ///////////////////////
        // Natural number transitions.
        
        var nat_circles = svg.selectAll("circle.natural");
        var nat_labels = svg.selectAll("text.natural");
                
        nat_circles.transition()
            .duration(1)
            .each("start", function(){
                d3.select(this)
                    .style("pointer-events", "none");       // Making the element unclickable, to prevent interrupting the transition.
            })
            .attr("cx", function(d) {return natScale.pos(d.ord);})
            .attr("cy", 9*H/16)
            .attr("r", function(d) {return natScale.rad(d.ord);})
            .each("end", function(){
                d3.select(this)
                    .style("pointer-events", null);     // Restoring the element's clickability.
            });
            
        nat_labels.transition()
            .duration(1)
            .each("start", function(){
                d3.select(this)
                    .style("pointer-events", "none");   // Making the element unclickable, to prevent interrupting the transition.
            })
            .attr("x", function(d) {return natScale.pos(d.ord);})
            .attr("y", function(d) {return 9*H/16 - 1.05*natScale.rad(d.ord);})
            .attr("font-size", function(d) {return natScale(d.ord)/6;})   // Picked this size because it looks good, nothing more
            .each("end", function(){
                d3.select(this)
                    .style("pointer-events", null);     // Restoring the element's clickability.
            });
        
        // Making sure all the circles have all the appropriate event listeners.
        
        d3.selectAll("circle.natural")
            .on("mouseover", over_func)
            .on("mouseout", out_func);
            
        d3.selectAll(".natural")
            .call(drag_thing);
        
        // Except, of course, for the central one.
        d3.selectAll(".natural")
            .filter(function(d) {return d.ord === (num_nats - 1)/ 2;})
            .on("mouseover", null)
            .on("mouseout", null)
            .on("click", null);
        
        // Add a couple of listeners if nat_central.value is 1 in order to bring up the one-isn't-prime tooltip.
        if (nat_central.value === 1) {
            
            svg.selectAll("#prime-equation")
                .on("mouseover", one_over_func)
                .on("mouseout", one_out_func);
            
            svg.selectAll("circle.natural")
                .filter(function(d) {return d.value === 1;})
                .on("mouseover", one_over_func)
                .on("mouseout", one_out_func);
        }
        else {
            one_out_func();
        };
};

////////////////////
// Binding event listeners and actions to objects on the screen.

// Bind click and mouseover listeners to all the natural numbers currently on screen.

var mindrag = W/20;

var drags = [];

var dragstart = function(){
    
    d3.selectAll(".natural")
        .style("pointer-events", "none");
};

var dragrecord = function(){
    drags.push(d3.event.x);
};

var dragmove = function(d, i){
    var diff = drags.pop() - drags[0];
    var dragbool = (Math.abs(diff) >= mindrag);
    var rightbool = (diff > 0);
    drags = [];
    if (dragbool) {
        if (rightbool){
            new_num = Math.max(nat_central.value - num_nats + 1, 1);
            new_key = d3.max(naturals.map(keys)) + 1;
            new_num_obj = {key:new_key, ord:(num_nats - 1)/2, value:new_num};
            clickfunc(new_num_obj);
        }
        else {
            new_num = nat_central.value + num_nats - 1;
            new_key = d3.max(naturals.map(keys)) + 1;
            new_num_obj = {key:new_key, ord:(num_nats - 1)/2, value:new_num};
            clickfunc(new_num_obj);
        };
    }
    else{
        if (d.value !== nat_central.value){
            
            clickfunc(d);
        }
        else{
            
            dummy_clickfunc(d);
        };
    };
};

var drag_thing = d3.behavior.drag()
    .on("dragstart", dragstart)
    .on("drag", dragrecord)
    .on("dragend", dragmove);
    
d3.selectAll("circle.natural")
    .on("mouseover", over_func)
    .on("mouseout", out_func);

d3.selectAll(".natural")
    .call(drag_thing);

// Except for the central one.
d3.selectAll("circle.natural")
    .filter(function(d) {return d.value === nat_central.value;})
    .on("mouseover", null)
    .on("mouseout", null);

// Finally, put a few listeners on the tiny question mark in the lower-right corner,
// a couple for a few simple transitions and the Fundamental Theorem tooltip on hover,
// and one for opening the Wikipedia article in a new tab on click.
q.on("mouseover", function() {
    
    // Base the tooltip's position on the location of the question mark.
    var xPosition = 3*W/4;
    var yPosition = 11*H/16;

    //Update the tooltip position and value
    d3.select("#theorem-tooltip")
    .style("width", W/7)
    .style("left", xPosition + "px")
    .style("top", yPosition + "px");
    
    d3.select("#theorem-tooltip")
        .select("p")
        .style("font-size", W/80 + "px");

    //Show the tooltip
    d3.select("#theorem-tooltip").classed("hidden", false);
    
    // Make the question mark bigger!
            // q.attr("fill", "blue");
    q.attr("fill", "blue")
        .attr("opacity", 1)
        .transition().duration(200)
        .attr("font-size", Math.min(W, H)/20*1.2);
    })
    .on("mouseout", function() {
        
        //Hide the tooltip
        d3.select("#theorem-tooltip").classed("hidden", true);
        
        // Make the question mark smaller!
        q.attr("fill", "black")
            .attr("opacity", 0.2);
        q.transition().duration(100)
            .attr("font-size", Math.min(W, H)/20);     
    });

// Finally, bring up the tooltip when the label for the primes gets a mouseover, and take it away when the mouse goes off the label.
svg.selectAll("#prime-label")
    .on("mouseover", function(d) {
        
        // Base the tooltip's position on the location of the mouse.
        var xPosition = d3.mouse(svg[0][0])[0];
        var yPosition = d3.mouse(svg[0][0])[1];
        
        var boxwidth = W/7;
        
        //Update the tooltip position and value
        d3.select("#prime-tooltip")
        .style("width", boxwidth + "px")
        .style("left", xPosition + "px")
        .style("top", yPosition + "px")
        .select("p")
        .style("font-size", W/80 + "px");;

        //Show the tooltip
        d3.select("#prime-tooltip").classed("hidden", false);

    })
    .on("mouseout", function() {

        //Hide the tooltip
        d3.select("#prime-tooltip").classed("hidden", true);
    });
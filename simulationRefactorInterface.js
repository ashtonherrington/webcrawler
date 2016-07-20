﻿// requires:
// linearScale.js
// particlesForceModelRefactor.js

var SimulationRefactorInterface = function () {
    
    // scaling objects
    var xscale = new LinearScale();
    var yscale = new LinearScale();
    
    // set the pixel scale of the simulation
    // scaling is defined such that pixels coordinates span the specified display area:
    // left = 0px, right = 'width' px
    // top = 0px, bottom = 'height' px
    // the simulation 0,0 will be centered in this area, i.e.
    // a node at 0,0 in the simulation will have pixel coordinates
    // of width/2 px, height/2 px
    // the 'physicalHeight' parameter specifies the physical height of the simulation
    // (the physical width will be calculated based on the aspect ratio of the display)
    this.setDisplayScale = function (width, height, physicalHeight) {
        // aspect ratio
        var ar = width / height;
        
        // bipolar range
        physicalHeight /= 2;
        
        yscale.setRange(physicalHeight, -physicalHeight, 0, height);
        xscale.setRange(-physicalHeight * ar, physicalHeight * ar, 0, width);

        simulation.xmin = -physicalHeight * ar;
        simulation.xmax = physicalHeight * ar;
        simulation.ymin = -physicalHeight;
        simulation.ymax = physicalHeight;
    };
    
    // initialize simulation and solver
    var simulation = new ParticleForceSimulationRefactor();
    this.getSimulation = function () { return simulation; };
    
    // define the default parameters for creating simulation particles and springs
    var particleMass = 1;
    var particleCharge = 0.5;
    var springDampingRatio = 0.5;
    var springConstant = 10;
    var springRestLength = 0.5;
    
    // frame timing variables; timing values in milliseconds (or 1/milliseconds)
    // nominal frame rate of 60 fps
    var framePeriod = 1000 / 60;
    var maxTimeStep = 250; // maximum timestep, in milliseconds
    var lastFrameTime;
    var stop;
    var timeoutId;
    
    // OPTIONAL callback to be executed after each timestep; will be passed the simulation object
    // signature: simulationStepCallback = function(simulation) {}
    var simulationStepCallback;
    
    this.setSimulationStepCallback = function (fn) {
        simulationStepCallback = fn;
    }
    
    // run the simulation
    this.runSimulation = function () {
        stop = false;
        lastFrameTime = Date.now();
        timeoutId = setTimeout(solverProc, framePeriod); // timeout to skip frame 0
    };
    
    // stop the simulation
    this.stopSimulation = function () {
        stop = true;
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
    }
    
    // method to step the solution
    var solverProc = function () {
        
        if (stop) {
            this.stopSimulation();
            return;
        }
        
        var elapsed = Date.now() - lastFrameTime;
        lastFrameTime = Date.now(); // capture the start time of this frame
        
        // set the time step        
        var dt = elapsed;
        if (dt > maxTimeStep) dt = maxTimeStep; // prevent excessive time step
        // simulation time step in seconds
        simulation.step(framePeriod / 1000);
        if (simulationStepCallback !== undefined) simulationStepCallback(simulation);
        
        // determine when to run the next timestep
        var timeout;
        if (elapsed >= framePeriod) timeout = 0; // run immediately
        else timeout = framePeriod - elapsed;
        setTimeout(solverProc, timeout);
    };
    
    // lookup dictionary: node.id --> node simulation index
    // i.e. nodeLookup[id] --> i, as in simulation.particles[i]
    var nodeLookup = {};
    
    // add a node to the simulation
    // id: the node ID number, provided by the server
    // IMPORTANT: id numbers MUST be unique!!!
    // parent: the id of the parent node (as provided by the server)
    this.addNode = function (id, parent) {
        
        // find the parent particle
        var parentIndex = nodeLookup[parent];
        var parent;
        var xparent = 0;
        var yparent = 0;
        if (parentIndex !== undefined) {
            parent = simulation.updateParticle(parentIndex);
            xparent = parent.x;
            yparent = parent.y;
        }
        
        // create the new particle
        var p = new Particle(
            id,
            {
                fixity: simulation.particles.length < 1, // fixity for root node
                mass: particleMass, 
                charge: particleCharge,
                // add the node on top of its parent
                x: xparent,
                y: yparent,
            });
        
        // add the particle to the simulation
        var index = simulation.addParticle(p, parentIndex, springRestLength, springConstant, springDampingRatio);
        
        // update the lookup table
        nodeLookup[id] = index;
    };
    
    // get particle objects
    // the id parameter is optional
    // if the id is provided, the function returns a single particle
    // otherwise, it returns the array of all particles
    // each particle object has several properties, including:
    // id: the server-assigned id of the particle
    // px: the pixel x coordinate
    // py: the pixel y coordinate
    // other properties are used internally and should be left alone
    // in particular, the children array uses the simulation's INTERNAL indexing,
    // NOT the child server-provided ID numbers
    this.provideCoordinates = function (id) {
        var index = nodeLookup[id];
        var particle, particles;
        if (index !== undefined) {
            particle = simulation.updateParticle(index); // update simulation coordinates
            if (particle !== undefined) {
                // update pixel coordinates
                particle.px = xscale.toOutputScaleOffset(particle.x);
                particle.py = yscale.toOutputScaleOffset(particle.y);
            }
            return particle;
        }
        else {
            particles = simulation.updateAllParticles();
            for (var i = 0; i < particles.length; i++) {
                particle = particles[i];
                particle.px = xscale.toOutputScaleOffset(particle.x);
                particle.py = yscale.toOutputScaleOffset(particle.y);
            }
            return particles;
        }
    }
    
    this.nodeDragStart = function (id) {
        var index = nodeLookup[id];
        if (index !== undefined) simulation.particles[index].hold = true;
    }
    
    this.updateNodeCoordinates = function (id, x, y) {
        var index = nodeLookup[id];
        if (index !== undefined) {
            // convert to simulation scale
            x = xscale.toInputScaleOffset(x);
            y = yscale.toInputScaleOffset(y);
            // update particle position
            simulation.setParticlePosition(index, x, y);
        }
    }
    
    this.nodeDragEnd = function (id) {
        var index = nodeLookup[id];
        if (index !== undefined) simulation.particles[index].hold = false;
    }

}

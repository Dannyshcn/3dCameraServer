var express = require('express');
var app = express();
var multer  = require('multer')
var upload = multer({ dest: 'uploads/' })

var server = require('http').Server(app);
var ss = require('socket.io-stream');

var io = require('socket.io')(server);

var os = require('os');
var fs = require('fs');
var path = require('path');
const process = require('process');
var timesyncServer = require('timesync/server')

var connections = new Set();
//var cameras = [];
var projectorsMap = new Map();
var camerasMap = new Map();

var clientUpdateIntervalTimer;
var projectorUpdateIntervalTimer;
var computeNodeUpdateIntervalTimer;

var lastestCapturedFolder = "";  //The folder contain the latest captured image

// Connection timeout at most 5 secs
server.setTimeout(5000);
// Let the server listen on port 3000 for the websocket connection
server.listen(3000);

app.get('/', function (request, response) {
    response.sendFile(__dirname + '/index.html');
});

app.use('/timeSync', timesyncServer.requestHandler );

app.post('/new-images', upload.array('images', 2), function (request, response, next) {
  console.log("Receieved new images ", request.body.socketId );
  if ( !request.files || request.files.length !== 2 || !request.body.startTime ){
    console.log("Upload failure.");
    return;
  }

  let folderName = getFolderName(request.body.startTime);
  let imagePath  = './images/' + folderName + '/normal/' + request.body.fileName;
  let imageProjPath = './images/' + folderName + '/project/' + request.body.fileName;

  var renameFile = function(name, new_name){
    fs.rename(name, new_name, function(err) {
        if (err) throw err;
        fs.unlink(name, function() {
            if (err) throw err;
        });
    });
  }

  renameFile(request.files[0].path, imagePath);
  renameFile(request.files[1].path, imageProjPath);

  var camera = camerasMap.get(request.body.socketId)//( request.body.cameraName );
  if ( undefined === camera ){
    console.trace("Error : Connection is not registered " + request.body.socketId );
  } else {
    camera.photoError     = false;
    camera.waitingOnPhoto = false;
    camera.photoSending   = false;
    camera.receivedPhoto  = true;
    camera.latestImage    = folderName + '/' + request.body.fileName;
  }

  lastestCapturedFolder = folderName;
  response.sendStatus(201);

});

app.post('/new-image', upload.single('image'), function (request, response) {
  return;
    console.log("received a new image", request.body.socketId);
    if (!request.file || !request.body.startTime) {
		console.log("Returning");
        return;
    }

    request.body.takeId;

    let folderName = getFolderName(request.body.startTime);
    let imagePath  = './images/' + folderName + '/' + request.body.fileName;

    var tmpPath = './' + request.file.path;

    fs.rename(tmpPath, imagePath, function(err) {
        if (err) throw err;

        // The camera has been moved to the right place, update our data array to show this
        /*var i = findCameraIndexByName(request.body.cameraName);
    		if ( i < cameras.length ){
    			cameras[i].photoError     = false;
    			cameras[i].waitingOnPhoto = false;
    			cameras[i].photoSending   = false;
    			cameras[i].receivedPhoto  = true;
    			cameras[i].latestImage    = folderName + '/' + request.body.fileName;
    		}else{
    			console.log("Camera not found: " + request.body.cameraName );
    		}*/
        var camera = camerasMap.get(request.body.socketId)//( request.body.cameraName );
        if ( undefined === camera ){
          console.trace("Error : Connection is not registered " + request.body.socketId );
        } else {
          camera.photoError     = false;
          camera.waitingOnPhoto = false;
          camera.photoSending   = false;
          camera.receivedPhoto  = true;
          camera.latestImage    = folderName + '/' + request.body.fileName;
        }

        fs.unlink(tmpPath, function() {
            if (err) throw err;
        });
    });

    lastestCapturedFolder = folderName;
    response.sendStatus(201);
});

app.use(express.static('static'));
app.use(express.static('images'));

// Setup on port 8080 as well for the web app
app.listen(8080, function () {
  console.log('3D Camera app listening on port 8080 and 3000')
})


// When a new camera connects set up the following
io.on('connection', function (socket) {
  console.log('A connection was made:', connections.size + " " + socket.id);

  if ( !connections.has(socket.id)){
    connections.add(socket.id);
  }else{
    console.log("Connections reconnecting : " + socket.id );
  }
  // Add the camera to a persistent list of devices
  /*
  var i = findCameraIndex(socket.id);
  if ( undefined == i ){//Camera not registered before
    cameras.push({
      socketId: socket.id,
      type: null,
      name: null,
      ipAddress: null,
      photoError: false,
      photoTaken: false,
      waitingOnPhoto: false,
      lastCheckin: null,
      photoSending: false,
      receivedPhoto: false,
      version: null,
      photoStatus: null
    });
  }*/

//	console.log( camerasMap );

  // Listen for heartbeat notifications from the cameras
  socket.on('camera-online', function(msg){
    // Update our cache
    /*
    var i = findCameraIndex(socket.id);
    cameras[i].type             = 'camera';
    cameras[i].name             = msg.name;
    cameras[i].ipAddress        = msg.ipAddress;
    cameras[i].lastCheckin      = new Date();
    cameras[i].updateInProgress = msg.updateInProgress;
    cameras[i].DSLRBatteryLevel = msg.DSLR_battery;

    if (msg.version) {
        cameras[i].version = msg.version;
    }
    if (msg.hostName) {
        cameras[i].hostName = msg.hostName;
    } else {
        cameras[i].hostName = null;
    }
*/

      //io.emit('camera-update', cameras);

		//@Lip update the cams for client
		// Update our cache
		var camera = camerasMap.get( socket.id );
		if ( undefined == camera ){
      camera = {
        socketId : socket.id,
      }
      camerasMap.set( socket.id, camera );
		}
		camera.type             = 'camera';
		camera.name             = msg.name;
		camera.ipAddress        = msg.ipAddress;
		camera.lastCheckin      = new Date();
		camera.updateInProgress = msg.updateInProgress;
    camera.DSLRBatteryLevel = msg.DSLR_battery;
		if (msg.version) {
			camera.version = msg.version;
		}
		if (msg.hostName) {
			camera.hostName = msg.hostName;
		} else {
			camera.hostName = null;
		}
  });

    // Listen for heartbeat notifications from the projectors
    socket.on('projector-online', function(msg){
      // Update our cache
      var projector = projectorsMap.get(socket.id);
      if ( undefined == projector ){
        projector = {
          type: 'projector',
        };
        projectorsMap.set( socket.id, projector );
      }
      projector.name             = msg.name;
      projector.ipAddress        = msg.ipAddress;
      projector.lastCheckin      = new Date();
      projector.updateInProgress = msg.updateInProgress;
      if (msg.version) {
          projector.version = msg.version;
      }
      if (msg.hostName) {
          projector.hostName = msg.hostName;
      } else {
          projector.hostName = null;
      }
      //io.emit('camera-update', cameras);
    });

    // Sent by the web interface
    socket.on('client-online', function(msg){
      // Update our cache
      /*var i = findCameraIndex(socket.id);
      cameras[i].type = 'client';
      */
      var client = camerasMap.get( socket.id );
      if ( undefined == client ){
        client = {
          socketId : socket.id,
        }
        camerasMap.set( socket.id, client );
      }

      client.type = 'client';

	    console.log("========---Client---=========");

      clientUpdateIntervalTimer = setInterval(clientUpdate, 200);
      projectorUpdateIntervalTimer = setInterval(projectorUpdate, 200);
      computeNodeUpdateIntervalTimer = setInterval( computeNodeStatusUpdate, 3000);
    });

    socket.on('reconstruct-obj', function(msg) {
      var computeUnit = msg.computeUnit;
    //  await sleep(200);
      var targetFolder = lastestCapturedFolder;
      if ( undefined !== msg.files.length ){
        targetFolder = path.dirname( msg.files[0].webkitRelativePath );
      }

      if ( "" == targetFolder ){
        console.log("No package reconized for reconstruction. Please capture the target first!");
        io.emit('reconstruct-complete', {computeUnit:computeUnit});
        return;
      }
      /*
      // Update our cache
      var i = findCameraIndex(socket.id);
      console.log("Reconstruct signal reciever: " + i );
      if ( cameras[i].type !== 'client'){
        return;
      }
      */
      var client = camerasMap.get( socket.id );
      if ( undefined === client || 'client' !== client.type ){
        return;
      }

      console.log("Ready to reconstruct!!!!!!");
      let folderName = './images/' ;
      var packageName = path.basename(targetFolder);
      var filename = folderName + "/" + packageName + '.zip';
      const node7z = require('node-7z');
      //var zip = new AdmZip();
      //zip.addLocalFolder( folderName + "/" + packageName );
      //zip.writeZip( filename );

      node7z.add( filename, folderName + "/" + packageName + "/*", { recursive: true, $progress: true } )
      .on('progress', (progress) => {
        if ( computes.has( computeUnit.ipAddress )){
          computes.get( computeUnit.ipAddress ).progress = progress.percent;
        }
      })
      .on('end', () => {
        console.log("Zipped package!");
        if ( computeSockets.has( computeUnit.ipAddress )) {
          computes.get( computeUnit.ipAddress ).status = "Busy";  // @Lip change the status to busy
          var socket_c = computeSockets.get( computeUnit.ipAddress );
          socket_c.emit('reconstruct-obj', {name: packageName + '.zip'});
        }else{
          console.warn("Invalid compute node :" + computeUnit.ipAddress );
        }
      })
      .on('error', (error) => {
        console.error(error);
      });

      // Invoke the next step here however you like
      //console.log(data);   // Put all of the code here (not the best solution)
      //io.emit('reconstruct-obj', msg);          // Or put the next step in a function and invoke it

    });

    socket.on('disconnect', function(msg, msg2) {
      /*
        var i = findCameraIndex(socket.id);
        cameras.splice(i, 1);
*/
      if ( !connections.delete( socket.id )){
        console.log("Disconnecting not registered connection : " + socket.id );
      }

		//io.emit('camerasMap-update', camerasMap);	//@Lip update camersa
      var client = camerasMap.get( socket.id );
      if ( client && client.type == 'client') {
          clearInterval(clientUpdateIntervalTimer);
          clearInterval(projectorUpdateIntervalTimer);
          clearInterval(computeNodeUpdateIntervalTimer)
      }
      //@Lip refresh the cameras Map
      if ( camerasMap.delete( socket.id )){
        console.log("Camera disconnected : " + socket.id );
        io.emit('camera-update', Array.from(camerasMap.values()));
      }
      //@Lip refresh the projector map
      if ( projectorsMap.delete( socket.id )){
        console.log("Projector disconnected : " + socket.id );
        io.emit('projector-update', Array.from(projectorsMap.values()));
      }

      console.log( "Socket disconnected : " + socket.id + "\n" + msg + "\n" + msg2 );
    });

	//
    socket.on('execute-command', function(msg){
        console.log("Execute Command : " + msg.command);

        msg.socketId = socket.id;
        io.emit('execute-command', msg);

        for (let i = 0; i < cameras.length; i++) {
            if (cameras[i].type == 'camera') {
                cameras[i].command = msg;
            }
        }

    });

    socket.on('timeSync-test', function(msg){
      io.emit('timeSync-test', msg);
    });

    socket.on('timeSync-return', function(msg){
      //console.log( "Return called");
      /*var i = findCameraIndex(socket.id);
      if ( msg.executeDelta ){
        cameras[i].photoTimeDelta = msg.executeDelta.toFixed(1);
      }
      if ( msg.executeDelta_DSLR ){
        cameras[i].photoTimeDelta_DSLR = msg.executeDelta_DSLR.toFixed(1);
      }
      if ( msg.networkLatency ){
        cameras[i].networkLatency  = msg.networkLatency.toFixed(1);
      }
      if ( msg.networkLatency_DSLR ){
        console.log( cameras[i].name + "    " + msg.networkLatency_DSLR );
        cameras[i].networkLatency_DSLR  = msg.networkLatency_DSLR.toFixed(1);
        console.log( cameras[i].name + "    " + cameras[i].networkLatency_DSLR );
      }
      //console.log( "Network latency delta: " + msg.networkLatency + " -- Diff : " + cameras[i].photoTimeDelta );
*/
      var camera = camerasMap.get( socket.id );
      if ( camera ){
        if ( msg.executeDelta ){
          camera.photoTimeDelta = msg.executeDelta.toFixed(1);
        }
        if ( msg.executeDelta_DSLR ){
          camera.photoTimeDelta_DSLR = msg.executeDelta_DSLR.toFixed(1);
        }
        if ( msg.networkLatency ){
          camera.networkLatency  = msg.networkLatency.toFixed(1);
        }
        if ( msg.networkLatency_DSLR ){
          camera.networkLatency_DSLR  = msg.networkLatency_DSLR.toFixed(1);
        }
        return;
      }
      var projector = projectorsMap.get( socket.id );
      if ( projector ){
        if ( msg.executeDelta ){
          projector.photoTimeDelta = msg.executeDelta.toFixed(1);
        }
        if ( msg.networkLatency ){
          projector.networkLatency  = msg.networkLatency.toFixed(1);
        }
        return;
      }
    });
    // When a take photo message comes in create the folder, update the cameras and pass on the take message to devices
    socket.on('take-photo', function(msg){
        console.log("Take a new photo");

        let folderName = './images/' + getFolderName(msg.time);

        if (!fs.existsSync(folderName)) {
            fs.mkdirSync(folderName);
            fs.mkdirSync(folderName + '/normal');
            fs.mkdirSync(folderName + '/project');
        }
        msg.socketId = socket.id;
        io.emit('take-photo', msg);
/*
        for (let i = 0; i < cameras.length; i++) {
            if (cameras[i].type == 'camera') {
                cameras[i].waitingOnPhoto = true;
                cameras[i].receivedPhoto  = false;
                cameras[i].photoTimeDelta  = null;
                cameras[i].photoTimeDelta_DSLR  = null;
                cameras[i].networkLatency  = null;
                cameras[i].networkLatency_DSLR  = null;
            }
        }
*/
        camerasMap.forEach((camera, key) => {
          if ( 'camera' == camera.type ){
            camera.waitingOnPhoto = true;
            camera.receivedPhoto  = false;
            camera.photoTimeDelta  = null;
            camera.photoTimeDelta_DSLR  = null;
            camera.networkLatency  = null;
            camera.networkLatency_DSLR  = null;
          }
        });
        projectorsMap.forEach((projector, key) => {
          projector.photoTimeDelta  = null;
          projector.networkLatency  = null;
        });

    });

    //@Lip for DSLR Support
    socket.on('take-photo-DSLR', function(msg){
        console.log("Take a new photo (DSLR)");

        let folderName = './images/' + getFolderName(msg.time);

        if (!fs.existsSync(folderName)) {
            fs.mkdirSync(folderName);
            fs.mkdirSync(folderName + '/normal');
            fs.mkdirSync(folderName + '/project');
        }
        msg.socketId = socket.id;
        io.emit('take-photo-DSLR', msg);
/*
        for (let i = 0; i < cameras.length; i++) {
            if (cameras[i].type == 'camera') {
                cameras[i].waitingOnPhoto = true;
                cameras[i].receivedPhoto  = false;
            }
        }*/

        camerasMap.forEach((camera, key) => {
          if (camera.type == 'camera') {
              camera.waitingOnPhoto = true;
              camera.receivedPhoto  = false;
          }
        });


    });

	socket.on('lights-switch', function(msg){
		var state = msg.state;
		io.emit('lights-switch',state);
	});

    socket.on('update-software', function(msg){
        console.log("Updating software");

        io.emit('update-software', msg);

    });

    socket.on('update-name', function(msg){
        console.log("Updating device name");

//        var i = findCameraIndex(msg.socketId);

        var camera = camerasMap.get( msg.socketId );
        if ( undefined === camera ){
          console.trace("Error : Connection is not registered " + msg.socketId );
          return;
        }

        // Broadcast a message but pass the ip of the camera that needs to respond
        io.emit('update-name', {ipAddress: camera.ipAddress, newName: msg.newName});
    });


    socket.on('sending-photo', function(msg){
        //var i = findCameraIndex(socket.id);

        var camera = camerasMap.get( socket.id );
        if ( undefined === camera ){
          console.trace("Error : Connection is not registered " + msg.socketId );
          return;
        }

        camera.photoSending = true;
    });


    // When a new photo comes in save it and send it on to the client
    socket.on('new-photo', function(msg){
        console.log("New photo data");
        //var i = findCameraIndex(socket.id);
        var camera = camerasMap.get( socket.id );
        if ( undefined === camera ){
          console.trace("Error : Connection is not registered " + msg.socketId );
          return;
        }
        camera.photoError = false;
        camera.photoTaken = true;
        //cameras[i].waitingOnPhoto = false;
        //cameras[i].photoSending   = false;
        //cameras[i].receivedPhoto  = true;

        let folderName = getFolderName(msg.startTime);

        msg.cameraName = camera.name;
        msg.imagePath  = folderName + '/' + msg.fileName;

        //io.emit('new-photo', msg);

        /*
        // Where is the image to be saved
        let folderName = getFolderName(msg.startTime);
        let fileName   = guid() + '.jpg';
        let imagePath  = './images/' + folderName + '/' + fileName;
        let thumbImagePath  = './images/' + folderName + '/thumb/' + fileName;

        if (!fs.existsSync('./images/' + folderName + '/thumb/')){
            fs.mkdirSync('./images/' + folderName + '/thumb/');
        }

        msg.cameraName = cameras[i].name;
        msg.imagePath  = folderName + '/' + fileName;

        let imageData = new Buffer(msg.data, 'base64')

        let parser = require('exif-parser').create(imageData);
        let result = parser.parse();

        fs.writeFile(imagePath, imageData, function () {
            msg.data       = null;

            if (result.hasThumbnail()) {
                console.log("Thumbnail found");
                fs.writeFile(thumbImagePath, result.getThumbnailBuffer(), function () {
                    msg.thumbImagePath  = folderName + '/thumb/' + fileName;
                    io.emit('new-photo', msg);
                });
            } else {
                io.emit('new-photo', msg);
            }
        });
        */

    });


    // There was an error taking a photo, update our data and the clients
    socket.on('photo-error', function(msg){
        //var i = findCameraIndex(socket.id);
        var camera = camerasMap.get( socket.id );
        if ( undefined === camera ){
          console.trace("Error : Connection is not registered " + msg.socketId );
          return;
        }
        camera.photoError     = true;
        camera.waitingOnPhoto = false;
        camera.photoSending   = false;
        camera.receivedPhoto  = false;
        io.emit('photo-error', msg);
        //io.emit('camera-update', cameras);
    });


	//@Lip command responses
    socket.on('command-finished', function(msg){
        //var i = findCameraIndex(socket.id);
        var camera = camerasMap.get( socket.id );
        if ( undefined === camera ){
          console.trace("Error : Connection is not registered " + msg.socketId );
          return;
        }

        camera.command = "<span style='color: greenyellow'>Done</span>";
        io.emit('command-finished', camera.ipAddress + ":" + msg);
        io.emit('camera-update', Array.from(camerasMap.values()));
    });

	//@Lip command responses
    socket.on('command-error', function(msg){
		  console.log( msg );
      //var i = findCameraIndex(socket.id);
      var camera = camerasMap.get( socket.id );
      if ( undefined === camera ){
        console.trace("Error : Connection is not registered " + msg.socketId );
        return;
      }
      camera.command = "<span style='color: red'>Failed</span>";
		  msg.id = socket.id;
      io.emit('command-error', camera.ipAddress + ":" + msg);
      io.emit('camera-update', Array.from(camerasMap.values()));
    });
});

function clientUpdate() {
  // Generate a status message for the camera
  camerasMap.forEach((camera, key) => {
    let photoStatus = 'standby';
    if (camera.waitingOnPhoto) {
        photoStatus = 'taking';
    }
    if (camera.photoSending) {
        photoStatus = 'sending';
    }
    if (camera.receivedPhoto) {
        photoStatus = 'received';
    }
    if (camera.updateInProgress) {
        photoStatus = 'updating-software';
    }
    camera.photoStatus = photoStatus;
  });
/*
    // Generate a status message for the camera
    for (let i = 0; i < cameras.length; i++) {
        let photoStatus = 'standby';
        if (cameras[i].waitingOnPhoto) {
            photoStatus = 'taking';
        }
        if (cameras[i].photoSending) {
            photoStatus = 'sending';
        }
        if (cameras[i].receivedPhoto) {
            photoStatus = 'received';
        }
        if (cameras[i].updateInProgress) {
            photoStatus = 'updating-software';
        }
        cameras[i].photoStatus = photoStatus;
    }
*/

    //io.emit('camera-update', cameras);
    io.emit('camera-update', Array.from( camerasMap.values()));
    io.emit('compute-update', Array.from( computes.values()) );
	//io.emit('camerasMap-update', camerasMap);	//@Lip update camerasMap

/*
    // See if any of the cameras have a new image
    for (let i = 0; i < cameras.length; i++) {
        if (cameras[i].receivedPhoto) {
            cameras[i].receivedPhoto = false;

            msg = {
                cameraName: cameras[i].name,
                imagePath: cameras[i].latestImage
            }
            io.emit('new-photo', msg);
        }
    }*/
    // See if any of the cameras have a new image
    camerasMap.forEach((camera, key) => {
      if (camera.receivedPhoto) {
          camera.receivedPhoto = false;

          msg = {
              cameraName: camera.name,
              imagePath: camera.latestImage
          }
          io.emit('new-photo', msg);
      }
    });

}

function projectorUpdate()
{
  io.emit('projector-update', Array.from( projectorsMap.values()));
}


// Locate our local camera data based on the socket id
function findCameraIndex(socketId) {
    for (let i = 0; i < cameras.length; i++) {
        if (cameras[i].socketId === socketId) {
            return i;
        }
    }
}

function findCameraIndexByName(name) {
    for (let i = 0; i < cameras.length; i++) {
        if (cameras[i].name === name) {
            return i;
        }
    }
}

function findCameraByName(name){
  var cameras = Array.from( camerasMap.values());
  for (let i = 0; i < cameras.length; i++) {
      if (cameras[i].name === name) {
          return cameras[i];
      }
  }
}

// Generate a folder name based on the timestamp
function getFolderName(time) {
    let date = new Date(Number(time));
    let dayOfWeek = ("0" + date.getDate()).slice(-2);
    let month = ("0" + (date.getMonth() + 1)).slice(-2);
    let hour = ("0" + (date.getHours() + 1)).slice(-2);
    let minute = ("0" + (date.getMinutes() + 1)).slice(-2);
    let seconds = ("0" + (date.getSeconds() + 1)).slice(-2);
    return date.getFullYear() + month + dayOfWeek + hour + minute + seconds;
}


// Generate a guid
function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
}

/*===========================================================================
For compute node

*/
var computes = new Map(); // The compute nodes
var computeSockets = new Map(); // The sockets;

function addComputeUnit( computeUnit, socket ){
  computes.set( computeUnit.ipAddress , computeUnit );  // @Lip save the socket
  computeSockets.set( computeUnit.ipAddress, socket ); //
}

function removeComputeUnit( ipAddress ){
  computes.delete( ipAddress );  // @Lip save the socket
  computeSockets.delete( ipAddress ); //
}

function findComputeNodes( computeIP )
{
  var socket_com = require('socket.io-client')(computeIP, {
    secure: true,
    reconnect: true,
    rejectUnauthorized: false
  });

  socket_com.on('connect', function() {
    var ifaces = os.networkInterfaces();
    var hostIP;
    var hostMAC;
    Object.keys(ifaces).forEach( function( ifname ) {
      ifaces[ ifname ].forEach( function( iface ) {
        if ( 'IPv4' !== iface.family || false !== iface.internal ){
          return;
        }
        hostIP = iface.address;
        hostMAC = iface.mac;
      });
    });

    socket_com.emit('verify-host', {
      ipAddress: hostIP,
      macAddress: hostMAC,
      version: "0.0",
    });


    var computeUnit = {
      name: "Eva-0",
      ipAddress: socket_com.io.opts.hostname,
      version: "0.0",
      progress: 0,
      status: "Ready"
    };

    if ( computes.has( socket_com.io.opts.hostname )){
      console.warn('Compute node is connected already!');
      return;
    }

    addComputeUnit( computeUnit, socket_com );

    console.log("Compute node is connected" );
  });

  socket_com.on('compute-node-status', ( msg ) => {
    var compute = computes.get( socket_com.io.opts.hostname );
    if ( compute ) {
      compute.status = msg.status;
    }
  });

  socket_com.on('reconstruct-log', function(msg) {
    io.emit('reconstruct-log', msg.message.toString());
  });

  //@Lip download the reconstructed result
  socket_com.on('reconstruct-complete', function( msg ) {
    var filename = msg.name;
    var stream   = ss.createStream({highWaterMark: 1024 * 1024 *10 });

    console.log( "Start download reconstructed result : " + filename)
    console.warn( "Please keep the network online." );

    ss(socket_com).emit('post-package', stream, { name: filename });
    var localName = path.basename( filename );
    stream.pipe( fs.createWriteStream( "results/" + localName, {highWaterMark: 1024 * 1024 * 10 }).on('finish', ()=> {
      console.log("Download completed.");
      var computeUnit = computes.get( socket_com.io.opts.hostname );
      computeUnit.status = "Ready";   // @Lip restore the status
      io.emit('reconstruct-complete', {computeUnit:computeUnit});
    }));
  });

  ss(socket_com).on('request-package', function(stream, data) {
    console.log("Upload images pack.");
    var filename = "./images/" + data.name;//path.basename( data.name );

    var stats = fs.statSync( filename );
    var fileSizeInBytes = stats["size"]
    var size = 0;
    var computeUnit = computes.get( socket_com.io.opts.hostname );

    fs.createReadStream( filename, {highWaterMark: 1024 * 1024 * 10 } ).on('data', function(chunk) {
      size += chunk.length;
      process.stdout.clearLine();
      process.stdout.cursorTo(0);

      var value = Math.floor(size / fileSizeInBytes * 100);

      socket_com.emit('stream-progress', {value: value});

      computeUnit.progress = value;

      var progress = "";
      for ( var i=0; i<value; ++i ){
        progress += ">";
      }
      for ( var i = value; i < 100; ++i ){
        progress += ".";
      }
      process.stdout.write( progress + " " + value + '%' );

      if ( 100 == value ) {
        process.stdout.write("\n"); // end the line
        console.log("Images sent to compute-node(s)/cloud.");
      }
      //console.log(Math.floor(size / fileSizeInBytes * 100) + '%');   // -> e.g. '42%'
    }).pipe( stream );
  });

  socket_com.on('stream-progress', function( msg ) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);

    var progress = "";
    var value = msg.value;
    var computeUnit = computes.get( socket_com.io.opts.hostname );
    computeUnit.progress = 100 - value; //

    for ( var i=0; i<value; ++i ){
      progress += ">";
    }
    for ( var i=value; i<100; ++i ){
      progress += ".";
    }
    progress += ' ' + value + "%";
    process.stdout.write( progress );
    if ( 100 <= value ){
      process.stdout.write('\n');
    }
  });

  socket_com.on('disconnect', function(reason) {
    console.log('Disconnected from compute node: ' + reason );
    removeComputeUnit( socket_com.io.opts.hostname );  // @Lip save the socket
  });
}

function computeNodeStatusUpdate() {
  computeSockets.forEach( (value, key, map) => {
    value.emit('compute-node-status', {});
  });
  io.emit('compute-update', Array.from( computes.values()) );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

findComputeNodes('https://192.168.10.17:3517');
findComputeNodes('https://192.168.1.107:3517');
findComputeNodes('https://192.168.10.183:3517');

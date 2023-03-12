require('dotenv').config();
const SpotifyWebApi = require(`spotify-web-api-node`);
const express = require(`express`);
const crypto = require(`crypto`).webcrypto;
const app = express()
const querystring = require(`querystring`);
const request = require(`request`);
const fs = require(`fs`)

const {SPOTIFY_CLIENT_ID: clientId, SPOTIFY_CLIENT_SECRET: clientSecret, SPOTIFY_REDIRECT_LOGIN: redirectUri, SPOTIFY_REDIRECT_LOGIN_CALLBACK: callbackUri, PORT: port} = process.env

let states = new Set();

app.get(`/spotify/login`, (req, res) => {
	const cryptoArray = new Uint32Array(16);
	crypto.getRandomValues(cryptoArray);
	const possibleChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

	let state = "";
	for (i = 0; i < cryptoArray.length; i++) {
		state += possibleChars[cryptoArray[i] % possibleChars.length];
	}

	states.add(state);
	let scope = "playlist-modify-private";

	res.redirect(`https://accounts.spotify.com/authorize?` +
		querystring.stringify({
			response_type: `code`,
			client_id: clientId,
			scope: scope,
			redirect_uri: callbackUri,
			state:state
		}));
});

app.get(`/spotify/login_callback`, (req, res) => {
	let code = req.query.code || null;
	let state = req.query.state || null;
	if(state === null || !states.has(state)) {
		res.redirect(`/error`+ 
			querystring.stringify({
				error: `state_mismatch`
			}));
	} else {
		let authOptions = {
			url: `https://accounts.spotify.com/api/token`,
			form: {
				code: code,
				redirect_uri: callbackUri,
				grant_type: `authorization_code`
			},
			headers: {
				'Authorization' : `Basic ` + btoa(`${clientId}:${clientSecret}`)
			},
			json: true
		};
		request.post(authOptions, async function(error, response, body) {
			if(!error && response.statusCode === 200) {
				const access_token = body.access_token;
				let result = await createPlaylist(access_token);
				if(result) {
					res.send(`Playlist made successfully!`);
				} else {
					res.send(`Complete playlist not made. . .  Check your spotify to see if a partial list was created.`);
				}

			} else {
				res.send(error);
			}
		});
	}	
});

async function createPlaylist(access_token) {
	let files = fs.readdirSync('./csvToUpload').filter(file => file.endsWith('.txt'));
	if(!files || files.length == 0) {return false;}

	const URIs = JSON.parse(fs.readFileSync(`./csvToUpload/${files[0]}`, `utf8`));

	spotifyApi.setAccessToken(access_token);

	let callsToMake = Math.ceil(URIs.length / 100);
	let numPlaylists = 0;
	let curPlaylist = null;
	try {
		for(callNum = 0; callNum < callsToMake; callNum++) {
			if(callNum % 100 == 0) {
				curPlaylist = await spotifyApi.createPlaylist(`Aggregate playlist ${numPlaylists + 1}`, { public : false});
			}
			await spotifyApi.addTracksToPlaylist(curPlaylist.body.id, URIs.slice(callNum * 100, Math.min((callNum + 1) * 100, URIs.length)));
		}
	} catch (error) {
		console.log(error);
		return false;
	}
	
	return true;
}

app.get(`/error`, (req,res) => {
	res.send(req.query.error);
});

app.listen(port, () => {
	console.log(`Listening on port ${port}`);
});

var spotifyApi = new SpotifyWebApi({
	clientId: clientId,
	clientSecret: clientSecret,
	redirectUri: redirectUri
});


import * as homeInfoController from "../controllers/homeInfo.controller.js";
import {
  searchAnimelovers,
  getInfoAnimelovers,
  getStreamAnimelovers,
} from "../sources/animelovers.js";
import { getEpisodesByTitle, getEpisodeStreamByTitle } from "../sources/animelovers.js";
import { 
  getEpisodesByTitle as getOdEpisodesByTitle, 
  getEpisodeStreamByTitle as getOdEpisodeStreamByTitle 
} from "../sources/otakudesu.js";
import * as categoryController from "../controllers/category.controller.js";
import * as topTenController from "../controllers/topten.controller.js";
import * as animeInfoController from "../controllers/animeInfo.controller.js";
import * as streamController from "../controllers/streamInfo.controller.js";
import * as searchController from "../controllers/search.controller.js";
import * as episodeListController from "../controllers/episodeList.controller.js";
import * as suggestionsController from "../controllers/suggestion.controller.js";
import * as scheduleController from "../controllers/schedule.controller.js";
import * as serversController from "../controllers/servers.controller.js";
import * as randomController from "../controllers/random.controller.js";
import * as qtipController from "../controllers/qtip.controller.js";
import * as randomIdController from "../controllers/randomId.controller.js";
import * as producerController from "../controllers/producer.controller.js";
import * as characterListController from "../controllers/voiceactor.controller.js";
import * as nextEpisodeScheduleController from "../controllers/nextEpisodeSchedule.controller.js";
import { routeTypes } from "./category.route.js";
import { getWatchlist } from "../controllers/watchlist.controller.js";
import getVoiceActors from "../controllers/actors.controller.js";
import getCharacter from "../controllers/characters.controller.js";
import * as filterController from "../controllers/filter.controller.js";
import getTopSearch from "../controllers/topsearch.controller.js";

export const createApiRoutes = (app, jsonResponse, jsonError) => {
  const createRoute = (path, controllerMethod) => {
    app.get(path, async (req, res) => {
      try {
        const data = await controllerMethod(req, res);
        if (!res.headersSent) {
          return jsonResponse(res, data);
        }
      } catch (err) {
        if (err.status === 404 || err.message.includes("not found") || err.message.includes("tidak ditemukan")) {
          return res.status(404).json({ message: err.message });
        }
        console.error(`Error in route ${path}:`, err);
        if (!res.headersSent) {
          return jsonError(res, err.message || "Internal server error");
        }
      }
    });
  };

  const createPostRoute = (path, controllerMethod) => {
    app.post(path, async (req, res) => {
      try {
        const data = await controllerMethod(req, res);
        if (!res.headersSent) {
          return jsonResponse(res, data);
        }
      } catch (err) {
        if (err.status === 404 || err.message.includes("not found") || err.message.includes("tidak ditemukan")) {
          return res.status(404).json({ message: err.message });
        }
        console.error(`Error in route ${path}:`, err);
        if (!res.headersSent) {
          return jsonError(res, err.message || "Internal server error");
        }
      }
    });
  };

  ["/api", "/api/"].forEach((route) => {
    app.get(route, async (req, res) => {
      try {
        const data = await homeInfoController.getHomeInfo(req, res);
        if (!res.headersSent) {
          return jsonResponse(res, data);
        }
      } catch (err) {
        console.error("Error in home route:", err);
        if (!res.headersSent) {
          return jsonError(res, err.message || "Internal server error");
        }
      }
    });
  });

  routeTypes.forEach((routeType) =>
    createRoute(`/api/${routeType}`, (req, res) =>
      categoryController.getCategory(req, res, routeType)
    )
  );

  createRoute("/api/top-ten", topTenController.getTopTen);
  createRoute("/api/info", animeInfoController.getAnimeInfo);
  createRoute("/api/episodes/:id", episodeListController.getEpisodes);
  createRoute("/api/servers/:id", serversController.getServers);
  createRoute("/api/stream", (req, res) => streamController.getStreamInfo(req, res, false));
  createRoute("/api/stream/fallback", (req, res) => streamController.getStreamInfo(req, res, true));
  createRoute("/api/search", searchController.search);
  createRoute("/api/filter", filterController.filter);
  createRoute("/api/search/suggest", suggestionsController.getSuggestions);
  createRoute("/api/schedule", scheduleController.getSchedule);
  createRoute(
    "/api/schedule/:id",
    nextEpisodeScheduleController.getNextEpisodeSchedule
  );
  createRoute("/api/random", randomController.getRandom);
  createRoute("/api/random/id", randomIdController.getRandomId);
  createRoute("/api/qtip/:id", qtipController.getQtip);
  createRoute("/api/producer/:id", producerController.getProducer);
  createRoute(
    "/api/character/list/:id",
    characterListController.getVoiceActors
  );
  createRoute("/api/watchlist/:userId{/:page}", getWatchlist);
  createRoute("/api/actors/:id", getVoiceActors);
  createRoute("/api/character/:id", getCharacter);
  createRoute("/api/top-search", getTopSearch);

  // ── AnimeLovers Source ──
  createRoute("/api/animelovers/search", async (req) => {
    const { q = "", page = 1 } = req.query;
    return await searchAnimelovers(q, page);
  });
  createRoute("/api/animelovers/info", async (req) => {
    const { id } = req.query;
    if (!id) throw new Error("Parameter 'id' wajib diisi");
    return await getInfoAnimelovers(id);
  });
  createRoute("/api/animelovers/stream", async (req) => {
    const { id } = req.query;
    if (!id) throw new Error("Parameter 'id' wajib diisi");
    return await getStreamAnimelovers(id);
  });

  // POST /api/animelovers/stream-by-title
  createPostRoute("/api/animelovers/stream-by-title", async (req) => {
    const payload = req.body;
    const ep = payload.ep || req.query.ep;
    if (!payload) throw new Error("Payload (body) wajib diisi");
    if (!ep) throw new Error("Parameter 'ep' (nomor episode) wajib diisi");
    return await getEpisodeStreamByTitle(payload, ep);
  });

  // POST /api/animelovers/episodes-by-title
  createPostRoute("/api/animelovers/episodes-by-title", async (req) => {
    const payload = req.body;
    if (!payload) throw new Error("Payload (body) wajib diisi");
    return await getEpisodesByTitle(payload);
  });

  // ==========================================
  // OTAKUDESU ROUTES
  // ==========================================

  createRoute("/api/otakudesu/stream-by-title", async (req) => {
    const { title, ep } = req.query;
    if (!title) throw new Error("Parameter 'title' wajib diisi");
    if (!ep) throw new Error("Parameter 'ep' (nomor episode) wajib diisi");
    return await getOdEpisodeStreamByTitle(title, ep);
  });

  createRoute("/api/otakudesu/episodes-by-title", async (req) => {
    const { title } = req.query;
    if (!title) throw new Error("Parameter 'title' wajib diisi");
    return await getOdEpisodesByTitle(title);
  });
};

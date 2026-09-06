import { layerTest } from "../testing";
import { databaseSuite } from "./database.shared";

databaseSuite("sqlite-node", layerTest);

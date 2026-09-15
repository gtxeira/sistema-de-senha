import { InMemoryQueueRepository } from "../../helpers/in-memory-repos/in-memory-queue-repo.js";
import { queueRepoContract } from "../../contracts/queue-repo.contract.js";

queueRepoContract(() => new InMemoryQueueRepository());

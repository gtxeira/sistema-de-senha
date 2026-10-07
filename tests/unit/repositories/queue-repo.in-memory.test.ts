import { InMemoryQueueRepository } from "../../helpers/in-memory-repos/in-memory-queue-repo";
import { queueRepoContract } from "../../contracts/queue-repo.contract";

queueRepoContract(() => new InMemoryQueueRepository());

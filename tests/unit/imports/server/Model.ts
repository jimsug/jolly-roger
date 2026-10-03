import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { assert } from "chai";
import { z } from "zod";
import {
  createdTimestamp,
  nonEmptyString,
  stringId,
  updatedTimestamp,
} from "../../../../imports/lib/typedModel/customTypes";
import {
  normalizeIndexOptions,
  normalizeIndexSpecification,
} from "../../../../imports/lib/typedModel/indexes";
import Model, {
  type InsertModelType,
  type ModelType,
  resetClock,
  setClock,
} from "../../../../imports/lib/typedModel/Model";
import attachSchema from "../../../../imports/server/attachSchema";
import type AssertTypesEqual from "../../../lib/AssertTypesEqual";
import withWriteFence from "../../../lib/withWriteFence";

const testModels: Set<Model<any>> = new Set();

async function createTestModel<T extends z.ZodType>(
  schema: T,
): Promise<Model<T>> {
  const collectionName = `test_schema_${Random.id()}`;
  const model = new Model(collectionName, schema);
  await attachSchema(model.schema, model.collection as any);
  testModels.add(model);
  return model;
}

describe("Model", function () {
  this.afterAll(async function () {
    for (const model of testModels) {
      await model.collection.dropCollectionAsync();
    }
    testModels.clear();
  });

  describe("customTypes", function () {
    describe("stringId", function () {
      const schema = z.object({
        // Meteor will auto-populate the _id field, so to test this we need a
        // separate field
        string: stringId,
      });
      let model: Model<typeof schema>;
      this.beforeAll(async function () {
        model = await createTestModel(schema);
      });

      it("it is required by the database schema enforcement", async function () {
        await assert.isRejected(
          model.insertAsync({}),
          /Document failed validation/,
        );

        // Make sure that it's required on the model type, but not on the insert
        // type
        const recordTypeTest: AssertTypesEqual<
          string,
          ModelType<typeof model>["string"]
        > = true;
        assert.isTrue(recordTypeTest);
        const insertTypeTest: AssertTypesEqual<
          string | undefined,
          InsertModelType<(typeof model)["schema"]>["string"]
        > = true;
        assert.isTrue(insertTypeTest);
      });
    });

    describe("timestamp fields", function () {
      const schema = z.object({
        createdAt: createdTimestamp,
        updatedAt: updatedTimestamp,
      });
      let model: Model<typeof schema>;
      this.beforeAll(async function () {
        model = await createTestModel(schema);
      });

      this.afterEach(function () {
        resetClock();
      });

      it("have the correct types", function () {
        const recordTypeTest: AssertTypesEqual<
          ModelType<typeof model>,
          {
            _id: string;
            createdAt: Date;
            updatedAt: Date;
          }
        > = true;
        assert.isTrue(recordTypeTest);
      });

      it("populates _id, createdAt, and updatedAt on insert", async function () {
        const id = await model.insertAsync({});
        const record = (await model.findOneAsync(id))!;

        assert.isOk(record);
        assert.isString(record._id);
        assert.instanceOf(record.createdAt, Date);
        assert.instanceOf(record.updatedAt, Date);
        assert.hasAllKeys(record, ["_id", "createdAt", "updatedAt"]);
      });

      it("fills in the same fields for a bulk insert", async function () {
        const initialDate = new Date();
        setClock(() => initialDate);

        const ids = await model.insertManyAsync([{}, {}]);
        assert.lengthOf(ids, 2);
        assert.notEqual(ids[0], ids[1]);
        for (const id of ids) {
          const record = (await model.findOneAsync(id))!;
          assert.isOk(record);
          assert.hasAllKeys(record, ["_id", "createdAt", "updatedAt"]);
          assert.deepEqual(record.createdAt, initialDate);
          assert.deepEqual(record.updatedAt, initialDate);
        }

        assert.deepEqual(await model.insertManyAsync([]), []);
      });

      it("tells the invalidation crossbar about a bulk insert", async function () {
        // The raw driver write bypasses Meteor, so observers without an
        // oplog only learn of the rows through this notification
        const notifications: { collection: string }[] = [];
        const originalRefresh = Meteor.refresh;
        Meteor.refresh = async (notification) => {
          notifications.push(notification);
          await originalRefresh(notification);
        };
        try {
          await model.insertManyAsync([{}, {}]);
        } finally {
          Meteor.refresh = originalRefresh;
        }
        assert.deepEqual(notifications, [{ collection: model.name }]);

        notifications.length = 0;
        Meteor.refresh = async (notification) => {
          notifications.push(notification);
          await originalRefresh(notification);
        };
        try {
          await model.insertManyAsync([]);
        } finally {
          Meteor.refresh = originalRefresh;
        }
        assert.isEmpty(notifications, "Nothing was written");
      });

      it("lets a write fence wait for observers to see a bulk insert", async function () {
        // The crossbar notification is what makes an observer register its
        // catch-up with the fence, so once the fence has fired the observer
        // has processed the rows
        const seen: string[] = [];
        const handle = await model
          .find({})
          .observeChangesAsync({ added: (id) => seen.push(id) });
        try {
          seen.length = 0;
          let ids: string[] = [];
          await withWriteFence(async () => {
            ids = await model.insertManyAsync([{}, {}]);
          });
          assert.includeMembers(seen, ids);
        } finally {
          handle.stop();
        }
      });

      it("only updates updatedAt on update", async function () {
        const initialDate = new Date();
        setClock(() => initialDate);

        const id = await model.insertAsync({});
        const record = (await model.findOneAsync(id))!;

        assert.isOk(record);
        assert.deepEqual(record.createdAt, initialDate);
        assert.deepEqual(record.updatedAt, initialDate);
        assert.hasAllKeys(record, ["_id", "createdAt", "updatedAt"]);

        const laterDate = new Date(initialDate.getTime() + 1000);
        setClock(() => laterDate);

        await model.updateAsync(id, {});
        const updatedRecord = (await model.findOneAsync(id))!;

        assert.isOk(updatedRecord);
        assert.hasAllKeys(updatedRecord, ["_id", "createdAt", "updatedAt"]);
        assert.deepEqual(updatedRecord.createdAt, initialDate);
        assert.deepEqual(updatedRecord.updatedAt, laterDate);
      });

      it("populates createdAt and updatedAt on upsert", async function () {
        const initialDate = new Date();
        setClock(() => initialDate);

        const id = Random.id();
        await model.upsertAsync(id, {});
        const record = (await model.findOneAsync(id))!;
        assert.isOk(record);

        assert.deepEqual(record.createdAt, initialDate);
        assert.deepEqual(record.updatedAt, initialDate);
        assert.hasAllKeys(record, ["_id", "createdAt", "updatedAt"]);

        const laterDate = new Date(initialDate.getTime() + 1000);
        setClock(() => laterDate);

        await model.upsertAsync(id, {});
        const updatedRecord = (await model.findOneAsync(id))!;

        assert.isOk(updatedRecord);
        assert.hasAllKeys(updatedRecord, ["_id", "createdAt", "updatedAt"]);
        assert.deepEqual(updatedRecord.createdAt, initialDate);
        assert.deepEqual(updatedRecord.updatedAt, laterDate);
      });
    });
  });

  // Schemas that aren't plain objects (like discriminated unions) get wrapped
  // in intersections, whose allOf validators are only satisfiable thanks to
  // the post-processing in imports/server/fixAllOfAdditionalProperties.ts
  // (though these tests should hold even after that workaround is gone).
  describe("intersection schemas", function () {
    const schema = z.discriminatedUnion("name", [
      z.object({ name: z.literal("foo"), foo: nonEmptyString }),
      z.object({ name: z.literal("bar"), bar: z.number() }),
    ]);
    let model: Model<typeof schema>;
    this.beforeAll(async function () {
      model = await createTestModel(schema);
    });

    it("accepts documents matching each variant", async function () {
      const fooId = await model.insertAsync({ name: "foo", foo: "x" });
      assert.isOk(await model.findOneAsync(fooId));
      const barId = await model.insertAsync({ name: "bar", bar: 3 });
      assert.isOk(await model.findOneAsync(barId));
    });

    it("rejects properties not declared by any variant", async function () {
      await assert.isRejected(
        model.insertAsync({ name: "foo", foo: "x", extra: "y" } as any),
        /Document failed validation/,
      );
    });

    it("rejects fields from the wrong variant", async function () {
      await assert.isRejected(
        model.insertAsync({ name: "foo", foo: "x", bar: 3 } as any),
        /Document failed validation/,
      );
    });
  });

  describe("indexes", function () {
    const schema = z.object({
      updatedAt: updatedTimestamp,
      ephemeral: z.boolean().optional(),
    });
    let model: Model<typeof schema>;
    this.beforeAll(async function () {
      model = await createTestModel(schema);
    });

    // Create the index the way imports/server/indexes.ts does, then read it
    // back the way the reconciler does: the two must agree, or the index
    // would be dropped and recreated on every boot.
    const roundTrips = async (spec: (typeof model.indexes)[number]) => {
      const collection = model.collection.rawCollection();
      await collection.createIndexes([
        {
          key: Object.fromEntries(spec.index),
          name: spec.name,
          ...Object.fromEntries(spec.options),
        },
      ]);
      const existing = (await collection.listIndexes().toArray()).find(
        (idx) => idx.name === spec.name,
      );
      assert.isDefined(existing);
      const { v: _v, key, name: _name, ...options } = existing;
      assert.equal(
        JSON.stringify([
          normalizeIndexSpecification(key),
          normalizeIndexOptions(options),
        ]),
        spec.stringified,
      );
    };

    it("carries a TTL through to the index the reconciler creates", async function () {
      model.addIndex({ updatedAt: 1 }, { expireAfterSeconds: 60 });
      const spec = model.indexes.at(-1)!;
      assert.equal(spec.name, "updatedAt_1");
      assert.deepEqual(spec.options, [["expireAfterSeconds", 60]]);
      await roundTrips(spec);
    });

    it("carries a partial TTL through as well", async function () {
      await model.collection.rawCollection().dropIndex("updatedAt_1");
      model.addIndex(
        { updatedAt: 1 },
        {
          expireAfterSeconds: 30,
          partialFilterExpression: { ephemeral: true },
        },
      );
      const spec = model.indexes.at(-1)!;
      assert.deepEqual(spec.options, [
        ["expireAfterSeconds", 30],
        ["partialFilterExpression", { ephemeral: true }],
      ]);
      await roundTrips(spec);
    });
  });

  // Note: these tests are basically making assertions about TypeScript types,
  // not what occurs at runtime.
  describe("type declarations", function () {
    const schema = z.object({
      createdAt: createdTimestamp,
      updatedAt: updatedTimestamp,
      string: nonEmptyString,
      number: z.number(),
    });
    let model: Model<typeof schema>;
    this.beforeAll(async function () {
      model = await createTestModel(schema);
    });

    const discriminatedUnionSchema = z.discriminatedUnion("name", [
      z.object({ name: z.literal("foo"), foo: nonEmptyString }),
      z.object({ name: z.literal("bar"), bar: z.number() }),
    ]);
    let discriminatedUnionModel: Model<typeof discriminatedUnionSchema>;
    this.beforeAll(async function () {
      discriminatedUnionModel = await createTestModel(discriminatedUnionSchema);
    });

    describe("insertAsync", function () {
      it("returns a promise of the _id type", function () {
        const insertTypeTest: AssertTypesEqual<
          ReturnType<typeof model.insertAsync>,
          Promise<string>
        > = true;
        assert.isTrue(insertTypeTest);
      });
    });

    describe("updateAsync", function () {
      it("accepts full document updates", function () {
        const modifierDoc = {
          string: "foo",
        };

        // We expected that this would require an @ts-expect-error, but for some reason it does not
        const modifier: Parameters<typeof model.updateAsync>[1] = modifierDoc;
        assert.isOk(modifier);
      });

      it("accepts mongo modifiers", function () {
        const modifier: Parameters<typeof model.updateAsync>[1] = {
          $set: { string: "foo" },
        };
        assert.isOk(modifier);
      });
    });

    describe("findOne", function () {
      it("can narrow a discriminated union", async function () {
        const result = await discriminatedUnionModel.findOneAsync({
          name: "foo",
        });
        const resultTypeTest: AssertTypesEqual<
          NonNullable<typeof result>,
          { _id: string; name: "foo"; foo: string }
        > = true;
        assert.isTrue(resultTypeTest);
      });
    });
  });
});

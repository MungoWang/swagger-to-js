const { camelCase } = require("change-case");

const { isPathException } = require("../common/is-path-exception");
const { templateRequestCode } = require("../common/templates/request-code");
const { pathDefaultParams } = require("../common/path-default-params");
const { tempateRequestTypes } = require("../common/templates/request-types");
const { pathParametersByIn } = require("../common/path-parameters-by-in");
const { getMode } = require("../common/get-mode");
const { buildObjectByRefs } = require("../common/build-object-by-refs");
const { buildObjectByMode } = require("../common/build-object-by-mode");

function swaggerV3ToJs(apiJson, config = {}) {
  const content = { code: "", types: "" };

  buildPaths(content, { apiJson, config });

  return content;
}

function buildPaths(content, state) {
  const { apiJson } = state;

  Object.keys(apiJson.paths).forEach((url) => {
    Object.keys(apiJson.paths[url]).forEach((method) => {
      const pathConfig = apiJson.paths[url][method];
      const pathParams = { url, method, pathConfig };

      if (isPathException(pathParams, state)) return;

      // Path code
      const pathCodeParams = buildPathCodeParams(pathParams, state);

      content.code += templateRequestCode(pathCodeParams);
      content.code += "\n\n";

      // Path types by variants
      const pathVariants = getPathVariants(pathParams, state);

      pathVariants.forEach((variant, index, variants) => {
        const pathVariantTypesParams = buildPathVariantTypesParams({
          variant,
          index,
          variants,
          pathParams,
          state,
        });

        content.types += tempateRequestTypes(pathVariantTypesParams);
        content.types += "\n\n";
      });
    });
  });
}

function buildPathCodeParams(pathParams, state) {
  const { pathConfig } = pathParams;
  const isWarningDeprecated =
    pathConfig.deprecated && state.config.deprecated !== "ignore";
  const isExistParams =
    Boolean(pathConfig.requestBody && pathConfig.requestBody.content) ||
    (pathConfig.parameters || []).length > 0;

  return {
    name: camelCase(pathConfig.operationId),
    method: pathParams.method,
    url: pathParams.url,
    isWarningDeprecated,
    isExistParams,
    defaultParams: pathDefaultParams(getPathVariants(pathParams, state)),
  };
}

function buildPathVariantTypesParams({
  variant,
  index,
  variants,
  pathParams,
  state,
}) {
  const countVariants = variants.length;
  const isMoreOneVariant = countVariants > 1;

  return {
    name: camelCase(pathParams.pathConfig.operationId),
    countVariants,
    index,
    params: buildPathParamsTypes(variant, pathParams, state),
    addedParams: isMoreOneVariant ? buildPathAddedParamsTypes(variant) : null,
    result: buildPathResultTypes(variant, pathParams, state),
  };
}

function buildPathParamsTypes(variant, pathParams, state) {
  if (variant.consume) {
    let body = getPathRequestBody(pathParams, state)[variant.consume];

    if (body) {
      body = { in: "body", name: "body", ...body };

      if (pathParams.pathConfig.parameters === undefined) {
        pathParams.pathConfig.parameters = [];
      }

      pathParams.pathConfig.parameters.push(body);
    }
  }

  const parametersByIn = pathParametersByIn(pathParams, state);

  if (Object.keys(parametersByIn).length) {
    const mode = getMode(variant.consume);
    const objectByRefs = buildObjectByRefs(parametersByIn, state);
    const objectByMode = buildObjectByMode(objectByRefs, mode);

    return objectByMode;
  }

  return null;
}

function buildPathAddedParamsTypes(variant) {
  const { consume, produce } = variant;
  const header = {};

  if (consume) {
    header.accept = { type: "string", enum: [consume] };
  }

  if (produce) {
    header["Content-Type"] = { type: "string", enum: [produce] };
  }

  if (Object.keys(header).length) {
    return { header };
  }

  return null;
}

function buildPathResultTypes(variant, pathParams, state) {
  if (variant.produce) {
    const result = getPathResponses(pathParams, state)[variant.produce];

    if (result) {
      const mode = getMode(variant.produce);
      const objectByRefs = buildObjectByRefs(result, state);
      const objectByMode = buildObjectByMode(objectByRefs, mode);

      return objectByMode;
    }
  }
}

function eachPathVariant(pathParams, state, callback) {
  const requestBody = getPathRequestBody(pathParams, state);
  const responses = getPathResponses(pathParams, state);

  const consumes = requestBody ? Object.keys(requestBody) : [null];
  const produces = responses ? Object.keys(responses) : [null];

  consumes.forEach((consume) => {
    produces.forEach((produce) => {
      callback({ consume, produce });
    });
  });
}

function getPathRequestBody(pathParams, state) {
  const { pathConfig } = pathParams;

  if (pathConfig.requestBody) {
    const requestBody = buildObjectByRefs(pathConfig.requestBody, state);

    if (requestBody) {
      return requestBody.content;
    }
  }

  return null;
}

function getPathResponses(pathParams, state) {
  const { pathConfig } = pathParams;

  if (pathConfig.responses && pathConfig.responses["200"]) {
    const result = buildObjectByRefs(pathConfig.responses["200"], state);

    if (result) {
      return result.content;
    }
  }

  return null;
}

function getPathVariants(pathParams, state) {
  const variants = [];

  eachPathVariant(pathParams, state, (variant) => variants.push(variant));

  return variants;
}

module.exports = { swaggerV3ToJs };

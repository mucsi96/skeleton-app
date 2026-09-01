package io.github.mucsi96.skeleton.config;

import java.util.regex.Pattern;

import org.springframework.aot.hint.MemberCategory;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.beans.factory.annotation.AnnotatedBeanDefinition;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ImportRuntimeHints;

/**
 * Reachability metadata for the Anthropic SDK's request and response models.
 *
 * The SDK is written in Kotlin, and Spring AI hands its parameter objects to
 * the SDK's own Jackson {@code ObjectMapper}, which has
 * {@code jackson-module-kotlin} registered. For a Kotlin class that module does
 * not read the constructor with plain Java reflection: it asks
 * {@code ReflectJvmMapping} to map the Kotlin constructor back to a
 * {@code java.lang.reflect.Constructor}. In a native image without metadata
 * that mapping finds nothing, and rather than a missing-reflection error it
 * fails as
 *
 * <pre>
 * KotlinReflectionInternalError: Could not compute caller for function:
 *     fun &lt;init&gt;(JsonField&lt;Long&gt;, JsonField&lt;List&lt;MessageParam&gt;&gt;, ...)
 * </pre>
 *
 * thrown while serializing the request body - so the symptom is every call to
 * the model failing at request time, with a stack trace naming Kotlin's
 * reflection internals rather than anything that is missing.
 *
 * Neither the Anthropic SDK nor spring-ai-anthropic ships native-image metadata
 * (2.40.1 / 2.0.0), so an application that wants a native image has to register
 * it. Whole packages are registered rather than the classes that fail today,
 * for the reason given in {@link AzureNativeHints}: the next model the SDK
 * reaches for fails the same way, pointing nowhere near its cause.
 * {@code com.anthropic.models.beta} is left out deliberately - two thirds of
 * the SDK's 10k classes, and nothing here calls the beta API.
 *
 * The scan reads bytecode rather than loading classes, and skips anonymous and
 * lambda classes. Both matter: Spring AI's own
 * {@code AiRuntimeHints.findJsonAnnotatedClassesInPackage} helper loads every
 * candidate, and loading one of those synthetic classes here
 * ({@code SseHandler$mapJson$1$handle$1}) throws
 * "This function has a reified type parameter and thus can only be inlined at
 * compilation time", which fails the build outright.
 *
 * Only the native image needs any of this. The AOT-on-JVM run described in
 * AGENTS.md cannot show the failure - reflection always works there.
 */
@Configuration(proxyBeanMethods = false)
@ImportRuntimeHints(AnthropicNativeHints.Registrar.class)
public class AnthropicNativeHints {

  static class Registrar implements RuntimeHintsRegistrar {

    private static final String[] PACKAGES = {
        "com.anthropic.models.messages",
        "com.anthropic.core"
    };

    /** Anonymous and lambda classes: a {@code $} followed by a digit. */
    private static final Pattern SYNTHETIC = Pattern.compile("\\$\\d");

    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
      final ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(
          false) {
        @Override
        protected boolean isCandidateComponent(AnnotatedBeanDefinition beanDefinition) {
          // The default rejects abstract types, which is where the SDK puts its
          // unions - ContentBlock and friends are needed just as much.
          return true;
        }
      };
      scanner.addIncludeFilter((metadataReader, metadataReaderFactory) -> true);

      for (String pkg : PACKAGES) {
        for (BeanDefinition definition : scanner.findCandidateComponents(pkg)) {
          final String name = definition.getBeanClassName();
          if (name == null || SYNTHETIC.matcher(name).find()) {
            continue;
          }
          hints.reflection().registerTypeIfPresent(classLoader, name,
              MemberCategory.INVOKE_DECLARED_CONSTRUCTORS,
              MemberCategory.INVOKE_DECLARED_METHODS,
              MemberCategory.ACCESS_DECLARED_FIELDS);
        }
      }
    }
  }
}

cmake_minimum_required(VERSION 3.13)
if(NOT PICO_SDK_PATH)
  set(PICO_SDK_PATH $ENV{PICO_SDK_PATH})
endif()
if(NOT PICO_SDK_PATH)
  message(FATAL_ERROR "Set PICO_SDK_PATH to a reviewed, pinned Raspberry Pi Pico SDK checkout")
endif()
set(PICO_BOARD pico2 CACHE STRING "Bench reference board")
include(${PICO_SDK_PATH}/external/pico_sdk_import.cmake)
project(rockstar_mini_supervisor C CXX ASM)
set(CMAKE_C_STANDARD 11)
pico_sdk_init()
add_executable(rockstar_mini_supervisor main.c supervisor.c)
target_compile_options(rockstar_mini_supervisor PRIVATE -Wall -Wextra -Werror)
target_link_libraries(rockstar_mini_supervisor pico_stdlib pico_rand hardware_watchdog)
pico_enable_stdio_usb(rockstar_mini_supervisor 1)
pico_enable_stdio_uart(rockstar_mini_supervisor 0)
target_compile_definitions(rockstar_mini_supervisor PRIVATE
 PICO_STDIO_USB_STDOUT_TIMEOUT_US=0
 PICO_STDIO_DEADLOCK_TIMEOUT_MS=1
 PICO_STDIO_USB_ENABLE_RESET_VIA_BAUD_RATE=0
 PICO_STDIO_USB_ENABLE_RESET_VIA_VENDOR_INTERFACE=0)
pico_add_extra_outputs(rockstar_mini_supervisor)

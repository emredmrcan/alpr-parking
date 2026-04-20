import cv2
import easyocr
from ultralytics import YOLO
from utils.plate_utils import preprocess_plate, validate_tr_plate

# 1. Setup and Initialization
#model = YOLO('models/license_plate_detector.pt')
#model = YOLO('models/license-plate-finetune-v1l.pt')
model = YOLO('runs/detect/runs/detect/turkish_plate_run/weights/best.pt')
#model = YOLO('models/license-plate-finetune-v1m.pt')
#model = YOLO('models/license-plate-finetune-v1n.pt')
#model = YOLO('models/license-plate-finetune-v1s.pt')

# Initialize EasyOCR Reader
# Note: Using 'tr' (Turkish) along with 'en' can improve recognition
reader = easyocr.Reader(['en', 'tr'], gpu=False)

# Turkish plates use: 0-9 and specific letters (Standard Latin, excluding some)
ALLOWLIST = '0123456789ABCDEFGHIJKLMNOPRSTUVYZ'


def process_alpr(source):
    """
    Process video/image source for Turkish license plate recognition.

    Args:
        source: Path to video/image file or camera index (0, 1, etc.)
    """
    # Determine if source is an image or video/camera
    is_image = isinstance(source, str) and source.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp'))

    if is_image:
        # Read single image
        frame = cv2.imread(source)
        if frame is None:
            print(f"Error: Could not read image {source}")
            return
        frames_to_process = [frame]
        is_video = False
    else:
        # Open video file or camera
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            print(f"Error: Could not open source {source}")
            return
        is_video = True

    print("--- ALPR System Started (Press 'q' to quit) ---")

    frame_count = 0

    while True:
        if is_video:
            ret, frame = cap.read()
            if not ret:
                break
        else:
            if frame_count >= len(frames_to_process):
                break
            frame = frames_to_process[frame_count]

        frame_count += 1

        # STEP 1: Detect Plate using YOLO model
        results = model(frame, verbose=False)[0]

        # Check if any detections were made
        if len(results.boxes) == 0:
            if not is_video:
                print("No plates detected in image")
            cv2.imshow('TR Plate Detection', frame)
            if cv2.waitKey(1 if is_video else 0) & 0xFF == ord('q'):
                break
            continue

        for result in results.boxes.data.tolist():
            x1, y1, x2, y2, score, class_id = result

            if score > 0.4:  # Lowered confidence threshold for better detection
                # STEP 2: Crop the plate from the frame with safety checks
                x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)

                # Ensure coordinates are within frame bounds
                h, w = frame.shape[:2]
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)

                # Check if crop region is valid
                if x2 <= x1 or y2 <= y1:
                    continue

                plate_crop = frame[y1:y2, x1:x2]

                # Check if crop is not empty
                if plate_crop.size == 0:
                    continue

                # STEP 3: Preprocess for better OCR
                processed_plate = preprocess_plate(plate_crop)

                if processed_plate is None:
                    continue

                # STEP 4: Perform OCR
                try:
                    detections = reader.readtext(
                        processed_plate,
                        allowlist=ALLOWLIST,
                        paragraph=False,
                        detail=1
                    )
                except Exception as e:
                    print(f"OCR Error: {e}")
                    continue

                # Process all OCR detections and combine if needed
                plate_texts = []
                for (bbox, text, prob) in detections:
                    if prob > 0.3:  # Slightly lowered threshold for OCR
                        plate_texts.append((bbox, text, prob))

                # If multiple detections, combine them
                if plate_texts:
                    # Sort by bounding box position (left to right)
                    plate_texts.sort(key=lambda x: x[0][0][0])
                    
                    # Combine all text segments
                    combined_text = ''.join([t[1] for t in plate_texts])
                    avg_prob = sum([t[2] for t in plate_texts]) / len(plate_texts)

                    # STEP 5: Validate Plate Format
                    # clean_text will have TR/TRI noise removed by validate_tr_plate
                    is_valid, clean_text = validate_tr_plate(combined_text)

                    # Display information
                    display_text = f"{clean_text} ({avg_prob:.2f})"
                    color = (0, 255, 0) if is_valid else (0, 165, 255)

                    # Console output
                    status = "VALID" if is_valid else "INVALID"
                    print(f"Frame {frame_count} - Plate: {clean_text} | Conf: {avg_prob:.2f} | Status: {status}")

                    # Draw visualization
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

                    # Add background to text for better visibility
                    text_size = cv2.getTextSize(display_text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
                    cv2.rectangle(frame,
                                  (x1, y1 - text_size[1] - 10),
                                  (x1 + text_size[0], y1),
                                  color, -1)
                    cv2.putText(frame, display_text, (x1, y1 - 5),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        # Show the video feed
        cv2.imshow('TR Plate Detection', frame)

        # For images, wait indefinitely; for video, wait 1ms
        wait_time = 0 if not is_video else 1
        if cv2.waitKey(wait_time) & 0xFF == ord('q'):
            break

    if is_video:
        cap.release()
    cv2.destroyAllWindows()
    print("--- System Closed ---")


if __name__ == "__main__":
    # Test with an image file
    #process_alpr("samples/ozel-plaka.jpg")
    #process_alpr("samples/2.jpeg")
    process_alpr("samples/8m.jpg")

    # OR Test with a video file
    #process_alpr("samples/videos/test.mov")
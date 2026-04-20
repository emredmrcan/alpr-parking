import os
import shutil
from ultralytics import YOLO

class PlateTrainer:
    def __init__(self, dataset_path, model_variant='yolo11n.pt'):
        """
        Initialize the trainer with the dataset path and YOLOv11 model variant.
        
        Args:
            dataset_path (str): Path to the data.yaml file.
            model_variant (str): YOLOv11 model variant (e.g., 'yolo11n.pt', 'yolo11s.pt').
        """
        self.dataset_path = os.path.abspath(dataset_path)
        self.model_variant = model_variant
        self.model = YOLO(model_variant)
        
    def train(self, epochs=100, imgsz=640, batch=16, name='turkish_plate_detector'):
        """
        Train the YOLOv11 model.
        
        Args:
            epochs (int): Number of training epochs.
            imgsz (int): Image size for training.
            batch (int): Batch size.
            name (str): Name for the training run.
            
        Returns:
            results: Training results object.
        """
        print(f"Starting training with {self.model_variant} on {self.dataset_path}...")
        
        results = self.model.train(
            data=self.dataset_path,
            epochs=epochs,
            imgsz=imgsz,
            batch=batch,
            name=name,
            # Ensure output is saved relative to project root
            project='runs/detect'
        )
        return results

    def export_best_model(self, run_name='turkish_plate_detector', destination='models/best_trained_plate_model.pt'):
        """
        Copies the best weights from the training run to the specified destination.
        
        Args:
            run_name (str): The name used during training.
            destination (str): Where to save the final .pt file.
        """
        best_weights = f"runs/detect/{run_name}/weights/best.pt"
        if os.path.exists(best_weights):
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            shutil.copy(best_weights, destination)
            print(f"Best model exported to: {destination}")
            return destination
        else:
            print(f"Error: Could not find best weights at {best_weights}")
            return None

if __name__ == "__main__":
    # Path to the data.yaml provided in the issue
    DATA_YAML_PATH = 'models/turkish_number_plates.v2i.yolov11/data.yaml'
    
    # Initialize the trainer
    # Variants: yolo11n.pt, yolo11s.pt, yolo11m.pt, yolo11l.pt, yolo11x.pt
    trainer = PlateTrainer(dataset_path=DATA_YAML_PATH, model_variant='yolo11n.pt')
    
    # Start training
    # Note: Using 10 epochs as a quick start/test example
    train_results = trainer.train(epochs=10, imgsz=640, batch=16, name='turkish_plate_run')
    
    # Export the best result to the models folder
    trainer.export_best_model(run_name='turkish_plate_run', destination='models/turkish_plate_yolov11.pt')
